#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { scanContract, getTrustScore } from "./api";

// Initialize the MCP Server
const server = new Server(
  {
    name: "web3guard-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "scan_local_contract",
        description: "Scans a local smart contract file (Solidity or Rust) for security vulnerabilities using Web3 Guard's AI engine.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The absolute or relative path to the local smart contract file.",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "get_contract_score",
        description: "Gets the live security trust score and grade of a deployed smart contract.",
        inputSchema: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description: "The blockchain address of the deployed smart contract.",
            },
          },
          required: ["address"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "scan_local_contract") {
    const filePath = String(args?.filePath);
    if (!filePath) {
      throw new Error("filePath is required");
    }
    try {
      const result = await scanContract(filePath);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error scanning contract: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "get_contract_score") {
    const address = String(args?.address);
    if (!address) {
      throw new Error("address is required");
    }
    try {
      const result = await getTrustScore(address);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching contract score: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start the server using stdio transport
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Web3 Guard MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running MCP Server:", error);
  process.exit(1);
});
