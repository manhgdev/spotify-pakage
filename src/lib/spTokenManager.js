import { spCurlToken } from './spCurlToken.js';
import { spClientToken } from './spClientToken.js';

export async function spTokenManager(cookies = {}) {
    try {
        // Thử sử dụng spCurlToken trước
        const curlData = await spCurlToken(cookies);
        if (!curlData) {
            throw new Error('spCurlToken returned null or undefined');
        }
        return curlData;
    } catch (curlError) {
        console.warn('spCurlToken failed:', curlError.message);

        try {
            // Nếu spCurlToken lỗi, fallback sang spClientToken
            const clientData = await spClientToken();
            return clientData;
        } catch (clientError) {
            // Nếu cả 2 đều lỗi, throw error
            throw new Error(`Both Spotify token methods failed. spCurlToken: ${curlError.message}, spClientToken: ${clientError.message}`);
        }
    }
}

// Example usage
// spTokenManager().then(console.log).catch(console.error);