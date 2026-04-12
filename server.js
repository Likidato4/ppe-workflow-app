import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, ".env");

const dotenvResult = dotenv.config({ path: envPath });

console.log("Dotenv load result:", {
  envPath,
  loaded: !dotenvResult.error,
  error: dotenvResult.error?.message || null
});

console.log("Environment check:", {
  cwd: process.cwd(),
  hasApiKey: Boolean(process.env.ROBOFLOW_API_KEY),
  apiKeyPrefix: process.env.ROBOFLOW_API_KEY?.slice(0, 4) || null,
  workspace: process.env.WORKSPACE_ID || null,
  workflow: process.env.WORKFLOW_ID || null
});

const app = express();
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/session", async (_req, res) => {
  try {
    if (!process.env.ROBOFLOW_API_KEY) {
      return res.status(500).json({
        error: "Missing ROBOFLOW_API_KEY in environment variables"
      });
    }

    if (!process.env.WORKSPACE_ID) {
      return res.status(500).json({
        error: "Missing WORKSPACE_ID in environment variables"
      });
    }

    if (!process.env.WORKFLOW_ID) {
      return res.status(500).json({
        error: "Missing WORKFLOW_ID in environment variables"
      });
    }

    const requestBody = {
      workspace: process.env.WORKSPACE_ID,
      workflow_id: process.env.WORKFLOW_ID,
      image_input_name: "image",
      stream_output: ["output_image"],
      data_output: ["count_objects", "predictions"],
      processing_timeout: 3600,
      requested_plan: "webrtc-gpu-medium",
      requested_region: "us"
    };

    console.log("Creating Roboflow session with:", {
      workspace: requestBody.workspace,
      workflow_id: requestBody.workflow_id
    });

    const response = await fetch("https://serverless.roboflow.com/infer/workflows/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ROBOFLOW_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    const rawText = await response.text();
    let data;

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { raw: rawText };
    }

    console.log("Roboflow response status:", response.status);
    console.log("Roboflow session response:", data);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to create Roboflow session",
        details: data
      });
    }

    return res.json(data);
  } catch (error) {
    console.error("Session creation failed:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
