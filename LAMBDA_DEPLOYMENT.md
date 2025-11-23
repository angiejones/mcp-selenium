# MCP Selenium HTTP Lambda Deployment Guide

This guide explains how to deploy MCP Selenium as an HTTP Lambda function that can be accessed via REST API.

## Architecture

The HTTP Lambda implementation converts MCP Selenium from a stdio-based server to a streamable HTTP endpoint that:
- Accepts MCP protocol requests over HTTP POST
- Supports Server-Sent Events (SSE) for streaming responses
- Runs in AWS Lambda with Chrome/Chromium
- Can be invoked via API Gateway

## Prerequisites

- Node.js 18.x or later
- AWS CLI configured with appropriate credentials
- One of the following deployment tools:
  - AWS SAM CLI (recommended)
  - Serverless Framework
  - Docker (for container deployment)

## Installation

```bash
# Install dependencies
npm install

# Install zod if not already present
npm install zod
```

## Deployment Options

### Option 1: AWS SAM (Recommended)

```bash
# Build the application
sam build

# Deploy to AWS
sam deploy --guided

# For subsequent deployments
sam deploy
```

The SAM deployment will:
- Create an HTTP API Gateway
- Deploy the Lambda function
- Configure CORS headers
- Set up appropriate IAM roles

### Option 2: Serverless Framework

```bash
# Install Serverless Framework globally
npm install -g serverless

# Install plugins
npm install --save-dev serverless-offline

# Deploy
serverless deploy

# For local testing
serverless offline
```

### Option 3: Docker Container to Lambda

```bash
# Build the Docker image
docker build -f Dockerfile.lambda -t mcp-selenium-lambda .

# Tag for ECR (replace with your ECR repo)
docker tag mcp-selenium-lambda:latest <account-id>.dkr.ecr.<region>.amazonaws.com/mcp-selenium-lambda:latest

# Push to ECR
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/mcp-selenium-lambda:latest

# Create Lambda function from container image
aws lambda create-function \
  --function-name mcp-selenium \
  --package-type Image \
  --code ImageUri=<account-id>.dkr.ecr.<region>.amazonaws.com/mcp-selenium-lambda:latest \
  --role arn:aws:iam::<account-id>:role/lambda-execution-role \
  --timeout 300 \
  --memory-size 1024
```

### Option 4: Direct ZIP Deployment

```bash
# Build the deployment package
npm run lambda:build

# Deploy using AWS CLI
aws lambda create-function \
  --function-name mcp-selenium \
  --runtime nodejs18.x \
  --handler src/lib/lambda.handler \
  --zip-file fileb://mcp-selenium-lambda.zip \
  --role arn:aws:iam::<account-id>:role/lambda-execution-role \
  --timeout 300 \
  --memory-size 1024
```

## Local Testing

Test the Lambda function locally before deployment:

```bash
# Start local HTTP server
npm run lambda:test

# The server will run on http://localhost:3000
```

### Test with curl

```bash
# Initialize MCP connection
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'

# List available tools
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'

# Start a browser
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "start_browser",
      "arguments": {
        "browser": "chrome",
        "options": {
          "headless": true
        }
      }
    }
  }'
```

## API Endpoints

Once deployed, your Lambda will expose these endpoints:

- `POST /message` - Main MCP protocol endpoint
- `POST /` - Alternative root endpoint
- `GET /sse` - Server-Sent Events endpoint for streaming
- `OPTIONS /{proxy+}` - CORS preflight handler

## Usage with MCP Clients

### HTTP Client Configuration

Configure your MCP client to use the HTTP endpoint:

```json
{
  "mcpServers": {
    "selenium": {
      "url": "https://<api-id>.execute-api.<region>.amazonaws.com/message",
      "transport": "http"
    }
  }
}
```

### Direct HTTP Requests

You can also make direct HTTP requests to the Lambda:

```javascript
const response = await fetch('https://<your-api-gateway-url>/message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'start_browser',
      arguments: {
        browser: 'chrome',
        options: { headless: true }
      }
    }
  })
});

const result = await response.json();
console.log(result);
```

## Chrome/Chromium Configuration

For Lambda deployment, you'll need to include Chrome/Chromium. Options:

### 1. Chrome Lambda Layer

Use a pre-built Chrome layer for AWS Lambda:

```yaml
# In serverless.yml or template.yaml
Layers:
  - arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:31
```

### 2. Custom Chrome Layer

Build your own Chrome layer:

```bash
mkdir -p layers/chrome/bin
cd layers/chrome/bin

# Download and extract Chrome for Lambda
wget https://github.com/sparticuz/chromium/releases/download/v119.0.0/chromium-v119.0.0-layer.zip
unzip chromium-v119.0.0-layer.zip
```

### 3. Container Image (Recommended for Chrome)

Use the provided `Dockerfile.lambda` which includes Chrome installation.

## Configuration

### Environment Variables

Set these environment variables in your Lambda configuration:

```yaml
Environment:
  Variables:
    NODE_ENV: production
    CHROME_BIN: /opt/chrome/chrome  # Path to Chrome binary
    CHROMEDRIVER_PATH: /opt/chromedriver  # Path to ChromeDriver
```

### Lambda Settings

Recommended Lambda configuration:

- **Runtime**: Node.js 18.x
- **Memory**: 1024 MB (minimum, increase if needed)
- **Timeout**: 300 seconds (5 minutes)
- **Ephemeral Storage**: 512 MB - 10 GB (if using /tmp for screenshots)

## Troubleshooting

### Chrome Not Found

If Chrome is not found in Lambda:
1. Verify Chrome layer is attached
2. Check `CHROME_BIN` environment variable
3. Ensure Chrome binary has execute permissions

### Timeout Issues

If operations timeout:
1. Increase Lambda timeout (max 15 minutes)
2. Use headless mode for faster execution
3. Consider async patterns for long operations

### Memory Issues

If Lambda runs out of memory:
1. Increase memory allocation (up to 10 GB)
2. Close browser sessions when done
3. Limit concurrent browser instances

## Security Considerations

1. **API Gateway Authorization**: Add API keys or IAM authorization
2. **CORS Configuration**: Restrict allowed origins in production
3. **Input Validation**: The Lambda validates all MCP requests
4. **Network Security**: Use VPC configuration if needed
5. **Secrets Management**: Use AWS Secrets Manager for sensitive data

## Cost Optimization

1. **Use Reserved Concurrency**: Limit concurrent executions
2. **Set Appropriate Timeout**: Don't use max timeout unless needed
3. **Use Provisioned Concurrency**: For high-traffic scenarios
4. **Monitor CloudWatch Metrics**: Track invocation count and duration
5. **Close Sessions Promptly**: Always close browser sessions when done

## Monitoring

Enable monitoring with CloudWatch:

```bash
# View logs
aws logs tail /aws/lambda/mcp-selenium --follow

# View metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=mcp-selenium \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

## Scaling

The Lambda automatically scales based on:
- Concurrent execution limit (default 1000)
- Reserved concurrency settings
- Regional quotas

For high-volume scenarios, consider:
1. Using Provisioned Concurrency
2. Implementing request queuing
3. Distributing across multiple regions

## Support

For issues or questions:
- GitHub Issues: https://github.com/angiejones/mcp-selenium/issues
- MCP Documentation: https://modelcontextprotocol.io

## License

ISC
