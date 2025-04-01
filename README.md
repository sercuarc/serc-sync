# SERC Sync

This is a Node service which handles syncing data from SERC's Web API and Wordpress site into the AWS OpenSearch index.

## Development

1. Clone the repo to your local machine. Make sure you're running Node > v23.10.0 or, if you have NVM installed, run:

```bash
nvm use
```

2. Then, install node modules:

```bash
npm install
```

3. Next, create a `.env` file in the root of the project and copy the following text into it. Update the OpenSearch credentials as needed. 

```env
# Change to "production" in a live environment
ENVIRONMENT = "dev"

# OpenSearch credentials
OPENSEARCH_HOST = "https://my-instance-name.com"
OPENSEARCH_USERNAME = "user"
OPENSEARCH_PASSWORD = "password"
```

4. Finally, run the following command to launch the server:

```bash
node server.js
```

## Deployment

Upon deployment to a public server, make sure to update the `ENVIRONMENT` variable to `"production"` (or anything other than `"dev"`).

## Public Usage

Once the application is running, the following routes are exposed:

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/sync` | This route triggers the syncing process. It may take a few minutes to complete. |

## Roadmap

- Add server logging