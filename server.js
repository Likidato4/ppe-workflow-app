import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const ROBOFLOW_API_KEY = "PUT_YOUR_REAL_PRIVATE_KEY_HERE";
const WORKSPACE_ID = "rpsppedetections";
const WORKFLOW_ID = "detect-count-and-visualize-5";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/session", async (_req, res) => {
  try {
    const response = await fetch("https://serverless.roboflow.com/infer/workflows/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ROBOFLOW_API_KEY}`
      },
      body: JSON.stringify({
        workspace: WORKSPACE_ID,
        workflow_id: WORKFLOW_ID,
        image_input_name: "image",
        stream_output: ["output_image"],
        data_output: ["count_objects", "predictions"],
        processing_timeout: 3600,
        requested_plan: "webrtc-gpu-medium",
        requested_region: "us"
      })
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    console.log("Roboflow response status:", response.status);
    console.log("Roboflow response body:", data);

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

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
