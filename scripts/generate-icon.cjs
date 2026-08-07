const { execSync } = require("child_process");
const path = require("path");

const scriptPath = path.join(__dirname, "..", "scripts", "crop_logo.py");
try {
  execSync(`python "${scriptPath}"`, { stdio: "inherit" });
  console.log("Edge-to-edge icons generated successfully!");
} catch (err) {
  console.error("Error generating icons via Python script:", err);
  process.exit(1);
}
