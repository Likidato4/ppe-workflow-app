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

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Failed to create Roboflow session",
        details: text
      });
    }

    const data = await response.json();
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
});
