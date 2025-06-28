const https = require("https");

// Test the login flow
const testLoginFlow = async (email, password) => {
  console.log(`Testing login for: ${email}`);

  // Step 1: Get the login page to get any CSRF tokens or session cookies
  const getLoginPage = () => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "bookings.frontierstrategies.ai",
        port: 443,
        path: "/auth/login",
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          console.log("Login page status:", res.statusCode);
          console.log("Cookies received:", res.headers["set-cookie"]);
          resolve({
            statusCode: res.statusCode,
            cookies: res.headers["set-cookie"],
            body: data,
          });
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.end();
    });
  };

  // Step 2: Attempt login
  const attemptLogin = (cookies) => {
    return new Promise((resolve, reject) => {
      const loginData = JSON.stringify({
        email: email,
        password: password,
      });

      const options = {
        hostname: "bookings.frontierstrategies.ai",
        port: 443,
        path: "/api/auth/callback/credentials",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": loginData.length,
          Cookie: cookies ? cookies.join("; ") : "",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          console.log("Login attempt status:", res.statusCode);
          console.log("Login response headers:", res.headers);
          console.log("Login response body:", data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.write(loginData);
      req.end();
    });
  };

  try {
    // Step 1: Get login page
    console.log("Step 1: Getting login page...");
    const loginPage = await getLoginPage();

    // Step 2: Attempt login
    console.log("Step 2: Attempting login...");
    const loginResult = await attemptLogin(loginPage.cookies);

    console.log("\n=== LOGIN FLOW RESULTS ===");
    console.log("Login page status:", loginPage.statusCode);
    console.log("Login attempt status:", loginResult.statusCode);
    console.log("Login response body:", loginResult.body);
  } catch (error) {
    console.error("Error testing login flow:", error);
  }
};

// Test with your admin credentials
testLoginFlow("jenner@frontierstrategies.ai", "your_password_here");
