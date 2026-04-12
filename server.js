import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/session", async (req, res) => {
  try {
    const response = await fetch("https://serverless.roboflow.com/infer/workflows/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ROBOFLOW_API_KEY}`
      },
      body: JSON.stringify({
        workspace: process.env.WORKSPACE_ID,
        workflow_id: process.env.WORKFLOW_ID,
        image_input_name: "image",
        stream_output: ["output_image"],
        data_output: ["count_objects", "predictions"],
        processing_timeout: 3600,
        requested_plan: "webrtc-gpu-medium",
        requested_region: "us"
      })
    });

    const rawText = await response.text();
    let data;

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { raw: rawText };
    }

    console.log("Roboflow session response:", data);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to create Roboflow session",
        details: data
      });
    }

    res.json(data);
  } catch (error) {
    console.error("Session creation failed:", error);
    res.status(500).json({
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
  console.log("Environment check:", {
    hasApiKey: Boolean(process.env.ROBOFLOW_API_KEY),
    workspace: process.env.WORKSPACE_ID,
    workflow: process.env.WORKFLOW_ID
  });
});
