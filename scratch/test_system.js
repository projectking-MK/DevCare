// Automated test runner for GuardianLink production server
const http = require('http');

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting GuardianLink Verification Suite...\n');
  let cookieHeader = '';
  let generatedPairingCode = '';
  let pairedDeviceId = '';

  // Test 1: Health check
  console.log('1. Testing /health endpoint:');
  const healthRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/health',
    method: 'GET'
  });
  console.log(`   Status: ${healthRes.statusCode}, Body: ${JSON.stringify(healthRes.json)}`);
  if (healthRes.statusCode !== 200 || healthRes.json?.status !== 'ok') {
    throw new Error('Health check failed!');
  }
  console.log('   ✅ Health check PASSED\n');

  // Test 2: Static client serving
  console.log('2. Testing client static serving (index.html):');
  const indexRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/',
    method: 'GET'
  });
  console.log(`   Status: ${indexRes.statusCode}, Contains GuardianLink: ${indexRes.body.includes('GuardianLink')}`);
  if (indexRes.statusCode !== 200 || !indexRes.body.includes('GuardianLink')) {
    throw new Error('Static index serving failed!');
  }
  console.log('   ✅ Static serving PASSED\n');

  // Test 3: WebRTC ICE Config
  console.log('3. Testing WebRTC ICE configuration endpoint:');
  const rtcRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/webrtc/config',
    method: 'GET'
  });
  console.log(`   Status: ${rtcRes.statusCode}, ICE Servers: ${JSON.stringify(rtcRes.json?.iceServers)}`);
  if (rtcRes.statusCode !== 200 || !Array.isArray(rtcRes.json?.iceServers)) {
    throw new Error('WebRTC config failed!');
  }
  console.log('   ✅ WebRTC config PASSED\n');

  // Test 4: Protected endpoint without auth
  console.log('4. Testing protected route rejection without authentication:');
  const unauthRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/devices',
    method: 'GET'
  });
  console.log(`   Status: ${unauthRes.statusCode} (Expected 401), Code: ${unauthRes.json?.code}`);
  if (unauthRes.statusCode !== 401) {
    throw new Error('Protected route was not rejected!');
  }
  console.log('   ✅ Protected route rejection PASSED\n');

  // Test 5: Parent Login
  console.log('5. Testing parent login with configured credentials:');
  const loginRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { email: 'parent@example.com', password: 'GuardianPass123!' }
  );
  console.log(`   Status: ${loginRes.statusCode}, User: ${JSON.stringify(loginRes.json?.user)}`);
  const setCookie = loginRes.headers['set-cookie'];
  console.log(`   Set-Cookie: ${setCookie ? setCookie[0].split(';')[0] : 'None'}`);

  if (loginRes.statusCode !== 200 || !setCookie) {
    throw new Error('Login failed!');
  }
  cookieHeader = setCookie[0].split(';')[0];
  console.log('   ✅ Parent login PASSED\n');

  // Test 6: Verify Session via /api/auth/me
  console.log('6. Testing authenticated session verification (/api/auth/me):');
  const meRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me',
    method: 'GET',
    headers: { Cookie: cookieHeader }
  });
  console.log(`   Status: ${meRes.statusCode}, Authenticated: ${meRes.json?.authenticated}, Email: ${meRes.json?.user?.email}`);
  if (meRes.statusCode !== 200 || !meRes.json?.authenticated) {
    throw new Error('Session verification failed!');
  }
  console.log('   ✅ Session verification PASSED\n');

  // Test 7: Generate Temporary Pairing Code
  console.log('7. Testing temporary pairing code generation:');
  const pairGenRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/pairing/generate',
    method: 'POST',
    headers: { Cookie: cookieHeader }
  });
  generatedPairingCode = pairGenRes.json?.code;
  console.log(`   Status: ${pairGenRes.statusCode}, Code: ${generatedPairingCode}, ExpiresAt: ${pairGenRes.json?.expiresAt}`);
  if (pairGenRes.statusCode !== 200 || !generatedPairingCode || generatedPairingCode.length !== 6) {
    throw new Error('Pairing code generation failed!');
  }
  console.log('   ✅ Pairing code generation PASSED\n');

  // Test 8: Child Device Verification
  console.log('8. Testing child device code verification & pairing:');
  const pairVerifyRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/pairing/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { code: generatedPairingCode, deviceName: 'Kid Galaxy S24' }
  );
  pairedDeviceId = pairVerifyRes.json?.device?.deviceId;
  console.log(`   Status: ${pairVerifyRes.statusCode}, DeviceId: ${pairedDeviceId}, Name: ${pairVerifyRes.json?.device?.deviceName}`);
  if (pairVerifyRes.statusCode !== 200 || !pairedDeviceId) {
    throw new Error('Pairing verification failed!');
  }
  console.log('   ✅ Child device pairing PASSED\n');

  // Test 9: One-time Code Invalidation
  console.log('9. Testing pairing code one-time invalidation (re-use should fail):');
  const reuseRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/pairing/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { code: generatedPairingCode, deviceName: 'Duplicate Attempt' }
  );
  console.log(`   Status: ${reuseRes.statusCode} (Expected 400), Error: ${reuseRes.json?.error}`);
  if (reuseRes.statusCode !== 400) {
    throw new Error('Pairing code was not invalidated!');
  }
  console.log('   ✅ One-time code invalidation PASSED\n');

  // Test 10: Parent retrieves paired device list
  console.log('10. Testing parent device listing:');
  const devListRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/devices',
    method: 'GET',
    headers: { Cookie: cookieHeader }
  });
  console.log(`   Status: ${devListRes.statusCode}, Device Count: ${devListRes.json?.devices?.length}`);
  const found = devListRes.json?.devices?.some((d) => d.deviceId === pairedDeviceId);
  if (devListRes.statusCode !== 200 || !found) {
    throw new Error('Device list did not include paired device!');
  }
  console.log('   ✅ Device listing PASSED\n');

  // Test 11: Logout
  console.log('11. Testing parent logout:');
  const logoutRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/logout',
    method: 'POST',
    headers: { Cookie: cookieHeader }
  });
  console.log(`   Status: ${logoutRes.statusCode}, Message: ${logoutRes.json?.message}`);
  if (logoutRes.statusCode !== 200) {
    throw new Error('Logout failed!');
  }
  console.log('   ✅ Parent logout PASSED\n');

  // Test 12: Verify session invalidated after logout
  console.log('12. Verifying session is invalidated after logout:');
  const postLogoutRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me',
    method: 'GET',
    headers: { Cookie: cookieHeader }
  });
  console.log(`   Status: ${postLogoutRes.statusCode} (Expected 401), Code: ${postLogoutRes.json?.code}`);
  if (postLogoutRes.statusCode !== 401) {
    throw new Error('Session was still active after logout!');
  }
  console.log('   ✅ Invalidation verification PASSED\n');

  console.log('🎉 ALL 12 END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
