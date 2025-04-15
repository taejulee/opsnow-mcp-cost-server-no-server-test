import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import * as dotenv from "dotenv";
import { promises as fs } from 'fs';

// Create server instance
const server = new McpServer({
  name: "cloud-cost",
  version: "1.0.0",
});

// Load environment variables silently
dotenv.config({ path: path.join(__dirname, "../.env") });

// Helper function for reading cost data from file
async function readCostData(): Promise<any | null> {
  try {
    const filePath = path.join(__dirname, "../data/cost.json");
    process.stderr.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "log",
      params: {
        level: "info",
        message: "Checking cost data file",
        data: { 
          filePath,
          fileExists: await fs.access(filePath).then(() => true).catch(() => false),
          currentDirectory: process.cwd(),
          __dirname
        }
      }
    }) + "\n");
    
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    return data;
  } catch (error) {
    process.stderr.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "log",
      params: {
        level: "error",
        message: "Error reading cost data from file",
        data: {
          error: error instanceof Error ? error.message : String(error),
          filePath: path.join(__dirname, "../data/cost.json"),
          cwd: process.cwd(),
          __dirname
        }
      }
    }) + "\n");
    return null;
  }
}

server.tool(
  "get-cost",
  "Get cloud cost summary for multiple vendors and months",
  {
    vendors: z.array(z.string()).optional().describe("List of cloud vendor names (e.g. ['AWS', 'Azure'])"),
    months: z.array(z.string()).optional().describe("List of months in YYYY-MM format (e.g. ['2024-04', '2024-05'])"),
  },
  async ({ vendors, months }) => {

    const data = await readCostData();
    if (!data || !data.Data) {
      const filePath = path.join(__dirname, "../data/cost.json");
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      return {
        content: [
          { 
            type: "text", 
            text: `File path: ${filePath}\nFile exists: ${fileExists}\nCurrent directory: ${process.cwd()}\n__dirname: ${__dirname}\nFailed to load cost data` 
          }
        ],
      };
    }
    
    const costData = data.Data;
    const selectedVendors = vendors && vendors.length > 0 ? vendors : Object.keys(costData);
    
    let responseText = "";
    
    for (const vendor of selectedVendors) {
      if (!costData[vendor]) continue;
      responseText += `Vendor: ${vendor}\n`;
      const vendorMonths = costData[vendor];
      const selectedMonths = months && months.length > 0 ?
         Object.keys(vendorMonths).filter(m => months.includes(m)) :
         Object.keys(vendorMonths);
      
      for (const month of selectedMonths) {
        responseText += `  Month: ${month}\n`;
        const entries = vendorMonths[month];
        if (Array.isArray(entries) && entries.length > 0) {
          for (const entry of entries) {
            responseText += `    Date: ${entry.date}\n`;
            responseText += `    Cost: $${entry.cost} USD\n`;
            responseText += `    Account ID: ${entry.accountId}\n`;
            responseText += `    Product Name: ${entry.productName}\n`;
            responseText += `    Region Name: ${entry.regionName}\n`;
            responseText += `\n`;
          }
        } else {
          responseText += `    No cost data available\n`;
        }
      }
      responseText += `\n`;
    }
    
    if (!responseText.trim()) {
      responseText = "No cost data found for the given parameters.";
    }
    
    return {
      content: [
        {
          type: "text",
          text: responseText,
        },
      ],
    };
  }
);

async function main() {
  const configJson = process.env.CONFIG;
  
  if (!configJson) {
    process.stderr.write(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "No configuration provided"
      }
    }) + "\n");
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(configJson);
  } catch (err) {
    const error = err as Error;
    process.stderr.write(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Invalid configuration JSON",
        data: error.message
      }
    }) + "\n");
    process.exit(1);
  }

  const license = config.license;
  if (!license) {
    process.stderr.write(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "No license key provided"
      }
    }) + "\n");
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(JSON.stringify({
    jsonrpc: "2.0",
    method: "log",
    params: {
      level: "info",
      message: "Cloud Cost MCP Server running on stdio"
    }
  }) + "\n");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
