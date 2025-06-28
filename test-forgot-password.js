const https = require("https");

// Test the forgot password endpoint
const testForgotPassword = async (email) => {
  const data = JSON.stringify({ email });

  const options = {
    hostname: "bookings.frontierstrategies.ai",
    port: 443,
    path: "/api/auth/forgot-password",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        console.log("Status:", res.statusCode);
        console.log("Headers:", res.headers);
        console.log("Response:", responseData);
        resolve({ status: res.statusCode, data: responseData });
      });
    });

    req.on("error", (error) => {
      console.error("Error:", error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
};

// Test with your admin email
const adminEmail = "jenner@consiliency.io"; // Replace with your actual admin email
console.log(`Testing forgot password for: ${adminEmail}`);
testForgotPassword(adminEmail)
  .then((result) => {
    console.log("Test completed successfully");
  })
  .catch((error) => {
    console.error("Test failed:", error);
  });
