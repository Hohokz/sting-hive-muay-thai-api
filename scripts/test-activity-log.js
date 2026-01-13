const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testLogging() {
  console.log('Testing Activity Log System...');

  try {
    // 1. Create a Booking (This should trigger a log)
    console.log('\n1. Creating a test booking...');
    const bookingResponse = await fetch(`${API_URL}/api/v1/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classes_schedule_id: "c1605e32-f9f7-4f97-ab76-10659c68b053", // Valid ID found from GET /api/v1/schedules

        client_name: "Test User Agent",
        client_email: "test-agent@example.com",
        client_phone: "0123456789",
        capacity: 1,
        date_booking: new Date().toISOString().split('T')[0]
      })
    });
    
    if (!bookingResponse.ok) {
        const errorData = await bookingResponse.json();
        throw new Error(`Booking failed: ${JSON.stringify(errorData)}`);
    }
    
    const bookingData = await bookingResponse.json();
    console.log('Booking Created:', bookingData.data.id);

    // 2. Fetch Logs
    console.log('\n2. Fetching activity logs...');
    const logsResponse = await fetch(`${API_URL}/api/v1/activity-logs?service=BOOKING&action=CREATE`);
    const logsData = await logsResponse.json();
    const latestLog = logsData.data.logs[0];
    
    if (latestLog && latestLog.details.booking_id === bookingData.data.id) {
      console.log('✅ Success: Activity log captured correctly!');
      console.log('Log Entry:', JSON.stringify(latestLog, null, 2));
    } else {
      console.log('❌ Failure: Activity log not found or mismatch.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testLogging();

