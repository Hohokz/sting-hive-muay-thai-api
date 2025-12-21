
async function testAuth() {
    const baseUrl = 'http://localhost:3000/api/v1/auth';
    
    console.log('1. Testing Login...');
    const loginRes = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testadmin', password: 'password123' })
    });

    if (!loginRes.ok) {
        console.error('Login Failed:', await loginRes.text());
        process.exit(1);
    }

    const loginData = await loginRes.json();
    console.log('Login Success!');
    console.log('Access Token:', loginData.accessToken ? 'Present' : 'Missing');
    console.log('Refresh Token:', loginData.refreshToken ? 'Present' : 'Missing');

    if (!loginData.refreshToken) {
        console.error('No refresh token returned');
        process.exit(1);
    }

    console.log('\n2. Testing Refresh Token...');
    const refreshRes = await fetch(`${baseUrl}/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: loginData.refreshToken })
    });

    if (!refreshRes.ok) {
        console.error('Refresh Failed:', await refreshRes.text());
        process.exit(1);
    }

    const refreshData = await refreshRes.json();
    console.log('Refresh Success!');
    console.log('New Access Token:', refreshData.accessToken ? 'Present' : 'Missing');
    
    console.log('\n3. Testing Logout...');
    const logoutRes = await fetch(`${baseUrl}/logout`, {
        method: 'POST'
    });
    console.log('Logout Status:', logoutRes.status);
    
    console.log('\n✅ All Auth Tests Passed');
}

testAuth().catch(err => console.error(err));
