/**
 * Spotify Token Generator
 * Extracts and implements the TOTP generation logic for Spotify API authentication
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { puppeteer_extract } from './secrets/puppeteer_extract.js';

// Read secret data from JSON file
function loadSecretData() {
    try {
        // Try multiple possible paths for secrets file
        const possiblePaths = [
            // Development/test environment
            path.join(process.cwd(), 'src/lib/secrets/secretBytes.json'),
            // Production environment (original path)
            path.join(process.cwd(), 'src/modules/carwl/spotify/lib/secrets/secretBytes.json'),
            // NPM package path (relative to this file)
            path.join(path.dirname(import.meta.url.replace('file://', '')), 'secrets/secretBytes.json')
        ];

        let secretData = null;
        for (const secretPath of possiblePaths) {
            if (fs.existsSync(secretPath)) {
                secretData = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
                break;
            }
        }

        // Get a random version
        const randomIndex = Math.floor(Math.random() * secretData.length);
        const randomSecret = secretData[randomIndex];

        return {
            SECRET_DATA: randomSecret.secret,
            TOTP_VERSION: randomSecret.version.toString()
        };
    } catch (error) {
        console.error('Failed to load secret data:', error.message);
        puppeteer_extract();
        // Fallback to hardcoded values if file reading fails
        return {
            SECRET_DATA: [59, 92, 64, 70, 99, 78, 117, 75, 99, 103, 116, 67, 103, 51, 87, 63, 93, 59, 70, 45, 32],
            TOTP_VERSION: "13"
        };
    }
}

// Generate the TOTP secret from the data array
function generateTOTPSecret(secretData) {
    // XOR each value with ((index % 33) + 9)
    const mappedData = secretData.map((value, index) =>
        value ^ ((index % 33) + 9)
    );

    // Convert to hex
    const hexData = Buffer.from(mappedData.join(""), "utf8").toString("hex");
    return hexData;
}

// TOTP generation function (simplified from the obfuscated code)
function generateTOTP(timestamp, secret) {
    const period = 30; // 30 seconds period
    const digits = 6;  // 6 digit code

    // Convert timestamp to counter (30-second periods since Unix epoch)
    const counter = Math.floor(timestamp / 1000 / period);

    // Convert counter to 8-byte buffer (big-endian)
    const counterBuffer = Buffer.allocUnsafe(8);
    counterBuffer.writeUInt32BE(0, 0);
    counterBuffer.writeUInt32BE(counter, 4);

    // HMAC-SHA1
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex'));
    const hash = hmac.update(counterBuffer).digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f;
    const truncatedHash = hash.slice(offset, offset + 4);

    // Convert to number and apply modulo
    const code = truncatedHash.readUInt32BE(0) & 0x7fffffff;
    const otp = code % Math.pow(10, digits);

    // Pad with leading zeros
    return otp.toString().padStart(digits, '0');
}

// Get server time from Spotify
async function getServerTime() {
    try {
        const response = await fetch('https://open.spotify.com/api/server-time', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                'Origin': 'https://open.spotify.com/',
                'Referer': 'https://open.spotify.com/',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const time = Number(data.serverTime);

        if (isNaN(time)) {
            throw new Error('Invalid server time');
        }

        return time * 1000; // Convert to milliseconds
    } catch (error) {
        console.warn('Failed to get server time, using local time:', error.message);
        return Date.now();
    }
}

// Generate authentication payload
async function generateAuthPayload(reason = "init", productType = "mobile-web-player") {
    const localTime = Date.now();
    const serverTime = await getServerTime();

    // Load secret data once to ensure SECRET_DATA and TOTP_VERSION are from the same version
    const { SECRET_DATA, TOTP_VERSION } = loadSecretData();
    const secret = generateTOTPSecret(SECRET_DATA);

    // Generate TOTP for current time
    const totp = generateTOTP(localTime, secret);

    // Generate TOTP for server time (divided by 30 for 30-second periods)
    const totpServer = generateTOTP(Math.floor(serverTime / 30), secret);

    return {
        reason,
        productType,
        totp,
        totpServer,
        totpVer: TOTP_VERSION // Version loaded from secrets file
    };
}

// Helper function để tạo và gửi token request
async function makeSpotifyTokenRequest(payload, cookies) {
    const url = new URL("https://open.spotify.com/api/token");
    Object.entries(payload).forEach(([key, value]) => {
        url.searchParams.append(key, value);
    });

    const cookieString = Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

    const config = {
        method: 'GET',
        url: url.toString(),
        headers: {
            'accept': '*/*',
            'accept-language': 'en,vi;q=0.9,en-US;q=0.8',
            'priority': 'u=1, i',
            'referer': 'https://open.spotify.com/',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            ...(cookieString && { 'cookie': cookieString })
        }
    };

    const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers
    });

    if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        throw error;
    }

    const result = await response.json();
    return { response, result };
}

// Make actual HTTP request to test the generated parameters
async function spGetToken(cookies = {}) {
    try {
        const payload = await generateAuthPayload();
        const { response, result } = await makeSpotifyTokenRequest(payload, cookies);
        return result;
    } catch (error) {
        // Handle 400 status - retry with new secrets
        // console.log(error.status)
        if (error.status == 400) {
            console.log('Token request failed with 400, extracting new secrets...');
            puppeteer_extract();
        }

        return {
            success: false,
            error: error.message,
            payload: payload,
            url: `https://open.spotify.com/api/token`
        };
    }
}

async function spRefreshToken(cookies = {}) {
    try {
        const response = await spGetToken(cookies);
        const client_id = response.clientId;

        let data = JSON.stringify({
            "client_data": {
                "client_version": "1.2.68.256.g7ba8ac84",
                "client_id": client_id,
                "js_sdk_data": {
                    "device_brand": "Apple",
                    "device_model": "unknown",
                    "os": "macos",
                    "os_version": "10.15.7",
                    "device_id": "",
                    "device_type": "computer"
                }
            }
        });

        let config = {
            method: 'POST',
            url: 'https://clienttoken.spotify.com/v1/clienttoken',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'accept-language': 'en',
                'origin': 'https://open.spotify.com',
                'referer': 'https://open.spotify.com/'
            },
            data: data
        };

        const response1 = await fetch(config.url, {
            method: config.method,
            headers: config.headers,
            body: config.data
        });

        if (!response1.ok) {
            throw new Error(`HTTP ${response1.status}: ${response1.statusText}`);
        }

        const result = await response1.json();
        // Cache kết quả nếu thành công (có accessToken)
        if (result.accessToken) {
            // Cache với thời gian expiry từ token (nếu có)
            const cacheTime = result.refresh_after_seconds
                ? (result.refresh_after_seconds - Date.now())
                : 5 * 60 * 1000; // default 5 phút

        }
        return result.granted_token.token;
    } catch (error) {
        console.log(error)
        throw "Failed to refresh Spotify token: " + error.message
    }
}

// Export the refresh function for external use
export async function spCurlToken(cookies = {}) {
    try {
        const result = await spGetToken(cookies);
        // console.log(result)
        return {
            token: result.accessToken,
            expirationTime: result.accessTokenExpirationTimestampMs
        }
    } catch (error) {
        throw "Failed to refresh Spotify token: " + error.message;
    }
}
// Example usage
// spGetToken().then(console.log).catch(console.error);