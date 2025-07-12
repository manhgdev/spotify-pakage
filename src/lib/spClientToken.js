
// Spotify Client Credentials
const CLIENT_ID = '5f573c9620494bae87890c0f08a60293';
const CLIENT_SECRET = '212476d9b0f3472eaa762d90b19b0ba8';

/**
 * Lấy Spotify Client Credentials Token
 */
export async function spClientToken() {
    // Fetch token mới
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ grant_type: 'client_credentials' })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const token = data.access_token;
        const dynamicCacheTime = data.expires_in * 1000; // Sử dụng expires_in từ Spotify

        return {
            token,
            expirationTime: dynamicCacheTime
        }
    } catch (error) {
        throw new Error(`Spotify token failed: ${error.message}`);
    }
}

// Example usage
// spClientToken().then(console.log).catch(console.error);