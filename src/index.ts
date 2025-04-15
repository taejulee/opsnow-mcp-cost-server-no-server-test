import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import * as dotenv from "dotenv";
import { promises as fs } from 'fs';
dotenv.config({ path: path.join(__dirname, "../.env") });

// Helper function for reading cost data from file
async function readCostData(): Promise<any | null> {
  try {
    const filePath = path.join(__dirname, "../data/cost.json");
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    return data;
  } catch (error) {
    console.error("Error reading cost data from file:", error);
    return null;
  }
}

// Create server instance
const server = new McpServer({
  name: "cloud-cost",
  version: "1.0.0",
});

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
      return {
        content: [
          { type: "text", text: "Failed to load cost data" }
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

// Start the server
async function main() {
  const args = process.argv.slice(2);
  let license = "";
  const licenseIndex = args.indexOf("--license");
  if (licenseIndex !== -1 && args.length > licenseIndex + 1) {
    license = args[licenseIndex + 1];
    console.log("License key provided:", license);
    // 여기에 라이선스 유효성 검사나 추가 설정 처리 코드를 넣을 수 있습니다.
  } else {
    console.warn("No license key provided. Running without a license setting.");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cloud Cost MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
