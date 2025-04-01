const express = require("express");
const { Client } = require("@opensearch-project/opensearch");
const pdfParse = require("pdf-parse");
const dotenv = require("dotenv");
const cors = require("cors");

// Load environment variables from .env
dotenv.config();

// Express App
const app = express();
app.use(cors());

// Configuration
const PORT = process.env.PORT || 3000;
const OPENSEARCH_HOST = process.env.OPENSEARCH_HOST;
const INDEX_NAME = "serc";
const UNIQUE_ID_FIELD = "os_id";
const MAX_CHARACTERS = 32000;

// OpenSearch Client
const client = new Client({
  node: OPENSEARCH_HOST,
  ssl: { rejectUnauthorized: process.env.ENVIRONMENT === "dev" || false }, // Use cautiously in production
  auth: {
    username: process.env.OPENSEARCH_USERNAME,
    password: process.env.OPENSEARCH_PASSWORD,
  },
});

// Retrieve Existing OpenSearch Documents
async function getExistingDocuments() {
  try {
    const { body } = await client.search({
      index: INDEX_NAME,
      body: { size: 10000, _source: [UNIQUE_ID_FIELD] },
    });

    return body.hits.hits.map(hit => hit._source[UNIQUE_ID_FIELD]);
  } catch (error) {
    console.error("Error retrieving documents:", error);
    throw new Error("Failed to fetch OpenSearch documents.");
  }
}

// Sync Data to OpenSearch
async function syncDataToOpenSearch(newDocs) {
  const existingDocIds = await getExistingDocuments();
  const newDocIds = newDocs.map(doc => doc[UNIQUE_ID_FIELD]);

  // Identify documents to delete
  const docIdsToDelete = existingDocIds.filter(id => !newDocIds.includes(id));

  const bulkBody = [];

  // Add delete operations
  docIdsToDelete.forEach(id => {
    bulkBody.push({ delete: { _index: INDEX_NAME, _id: id } });
  });

  // Add new documents
  newDocs.forEach(doc => {
    bulkBody.push({ index: { _index: INDEX_NAME, _id: doc[UNIQUE_ID_FIELD] } }, doc);
  });

  try {
    const { body } = await client.bulk({ body: bulkBody });
    return { deleted: docIdsToDelete, indexed: newDocIds, results: body };
  } catch (error) {
    console.error("OpenSearch sync error:", error);
    throw new Error("Failed to sync data to OpenSearch.");
  }
}

// Create a namespaced unique ID
function getNamespacedId(doc) {
  const type = doc.type.toLowerCase().replace(/\s/g, "-");
  return `${type}-${doc.id}`;
}

// Process PDF and Extract Text
async function getPDFText(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    const pdfBuffer = await response.arrayBuffer();
    const data = await pdfParse(Buffer.from(pdfBuffer));
    return data.text;
  } catch (error) {
    console.error("Error processing PDF:", error);
    return null;
  }
}

function sanitizeText(text) {
  // Replace <br> and <p> tags with spaces
  text = text.replace(/<\s*(br|p)\s*\/?>/gi, ' ');
  // Remove remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Normalize spaces
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

// API Endpoint to Sync Data
app.get("/sync", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const endpoints = [
    "http://serc.ddev.site/wp-json/serc-2025/v1/events",
    "https://web.sercuarc.org/api/technical-reports",
    // "http://serc.ddev.site/wp-json/serc-2025/v1/posts",
    // "http://serc.ddev.site/wp-json/serc-2025/v1/people",
  ];

  try {
  
    // Fetch data
    const promises = await Promise.all(endpoints.map(endpoint => fetch(endpoint)));
    const data = await Promise.all(promises.map(p => p.json()));
    // Flatten it
    const flatData = data.flat().slice(0, 10);
    await Promise.all(flatData.map(async doc => {
      // Set a unique identifier
      doc[UNIQUE_ID_FIELD] = getNamespacedId(doc);
      // Santize fields
      if ( doc.abstract ) {
        doc.abstract = sanitizeText(doc.abstract);
      }
      // Parse PDF content
      if (doc.file_s3) {
        const file_text = await getPDFText(doc.file_s3);
        const chunks = [];
        for (let i = 0; i < file_text.length; i += MAX_CHARACTERS) {
          const chunk = file_text.substring(i, i + MAX_CHARACTERS);
          chunks.push(sanitizeText(chunk));
        }
        doc.file_text = chunks;
      }
    }));
    // Sync with OpenSearch
    const syncResult = await syncDataToOpenSearch(flatData);
    // Return response
    res.json({ "success" : true, result: syncResult });
  
  } catch(e) {
    res.status(500).json({ error: "Could not sync data", message: e.message });
  }

});

// Start Express Server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
