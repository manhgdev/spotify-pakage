import { SpotifyGetToken, SpotifyMyProfile, SpotifyPlaylistContents, SpotifyPlaylistMetadata } from "./types";
import crypto from 'crypto';

export class SpotiflyBase {

    protected token = "";
    protected tokenExpirationTimestampMs = -1;
    protected cookie: string;
    private myProfileId = "";

    constructor(cookie?: string) {
        this.cookie = cookie ?? "";
    }

    protected async refreshToken() {
        if (this.tokenExpirationTimestampMs > Date.now()) return;

        try {
            // Nếu có cookie, ưu tiên sử dụng để xác thực
            if (this.cookie) {
                try {
                    const response = await fetch("https://open.spotify.com/api/token?reason=transport&productType=web_player", {
                        headers: { 
                            cookie: this.cookie
                        }
                    });
                    if (response.ok) {
                        const data = await response.json() as SpotifyGetToken;
                        this.token = "Bearer " + data.accessToken;
                        this.tokenExpirationTimestampMs = data.accessTokenExpirationTimestampMs;
                        return;
                    } else {
                        console.warn("Không thể xác thực bằng cookie, cố gắng dùng TOTP...");
                    }
                } catch (cookieError) {
                    console.warn("Lỗi khi xác thực bằng cookie:", cookieError);
                }
            }
            
            // Nếu không có cookie hoặc xác thực bằng cookie thất bại, dùng TOTP
            const payload = await this.generateAuthPayload();
            const url = new URL("https://open.spotify.com/api/token");

            Object.entries(payload).forEach(([key, value]) => {
                url.searchParams.append(key, value);
            });

            const tokenUrl = url.toString();
            let response = await fetch(tokenUrl);
            
            // Nếu request thất bại, thử lại một lần
            if (!response.ok) {
                console.warn("Lần đầu request thất bại, đang thử lại...");
                response = await fetch(tokenUrl);
                if (!response.ok) {
                    throw new Error(`Failed to get token after retry. Status: ${response.status}`);
                }
            }
            
            const responseText = await response.text();
            try {
                const data = JSON.parse(responseText) as SpotifyGetToken;
                this.token = "Bearer " + data.accessToken;
                this.tokenExpirationTimestampMs = data.accessTokenExpirationTimestampMs;
            } catch (parseError) {
                console.error("Lỗi khi parse response:", responseText);
                throw parseError;
            }
        } catch (error) {
            console.error("Lỗi khi làm mới token:", error);
            throw error;
        }
    }

    protected async getSpotifyAccessToken() {
        try {
          console.log('Requesting Spotify access token...');
          const CLIENT_ID = '5f573c9620494bae87890c0f08a60293';
            const CLIENT_SECRET = '212476d9b0f3472eaa762d90b19b0ba8';
            const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
            const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
          
          // Base64 encode the client ID and secret
          const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
          
          // Make the token request
          const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': USER_AGENT
            },
            body: 'grant_type=client_credentials'
          });
          
          console.log(`Response status: ${response.status}`);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error response: ${errorText}`);
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          
          const data = await response.json();
          return data;
        } catch (error) {
          console.error('Failed to get token:', error);
          throw error;
        }
      }

    private async generateAuthPayload(reason = "init", productType = "mobile-web-player") {
        const localTime = Date.now();
        const serverTime = await this.getServerTime();
        const secret = this.generateTOTPSecret();

        // Generate TOTP for current time
        const totp = this.generateTOTP(localTime, secret);

        // Generate TOTP for server time (divided by 30 for 30-second periods)
        const totpServer = this.generateTOTP(Math.floor(serverTime / 30), secret);

        return {
            reason,
            productType,
            totp,
            totpServer,
            totpVer: "9" // Version extracted from the obfuscated code
        };
    }

    // Generate the TOTP secret from the data array
    private generateTOTPSecret() {
        // Extracted from the obfuscated JavaScript - the secret data array
        const SECRET_DATA = [59,92,64,70,99,78,117,75,99,103,116,67,103,51,87,63,93,59,70,45,32];

        // XOR each value with ((index % 33) + 9)
        const mappedData = SECRET_DATA.map((value, index) =>
            value ^ ((index % 33) + 9)
        );

        // Convert to hex
        const hexData = Buffer.from(mappedData.join(""), "utf8").toString("hex");
        return hexData;
    }

    // TOTP generation function (simplified from the obfuscated code)
    private generateTOTP(timestamp: number, secret: string): string {
        const period = 30; // 30 seconds period
        const digits = 6;  // 6 digit code

        // Convert timestamp to counter (30-second periods since Unix epoch)
        const counter = Math.floor(timestamp / 1000 / period);

        // Convert counter to 8-byte buffer (big-endian)
        const counterBuffer = Buffer.allocUnsafe(8);
        counterBuffer.writeUInt32BE(0, 0);
        counterBuffer.writeUInt32BE(counter, 4);

        // HMAC-SHA1 - convert to Uint8Array for compatibility
        const secretBuffer = new Uint8Array(Buffer.from(secret, 'hex'));
        const hmac = crypto.createHmac('sha1', secretBuffer);
        const hash = hmac.update(new Uint8Array(counterBuffer)).digest();

        // Dynamic truncation
        const offset = hash[hash.length - 1] & 0x0f;
        const truncatedHash = hash.slice(offset, offset + 4);

        // Convert to number and apply modulo
        const code = truncatedHash.readUInt32BE(0) & 0x7fffffff;
        const otp = code % Math.pow(10, digits);

        // Pad with leading zeros
        return otp.toString().padStart(digits, '0');
    }
    
    private async getServerTime() {
        try {
            const response = await fetch('https://open.spotify.com/api/server-time', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                    'Origin': 'https://open.spotify.com/',
                    'Referer': 'https://open.spotify.com/',
                }
            });

            const data = await response.json() as { serverTime: string | number };
            const time = Number(data.serverTime);

            if (isNaN(time)) {
                throw new Error('Invalid server time');
            }

            return time * 1000; // Convert to milliseconds
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.warn('Failed to get server time, using local time:', errorMessage);
            return Date.now();
        }
    }

    protected async fetch<T>(url: string, optionalHeaders?: { [index: string]: string; }) {
        await this.refreshToken();
        return (await fetch(url, {
            headers: { authorization: this.token, ...optionalHeaders }
        })).json<T>();
    }

    protected async post<T>(url: string, body: string) {
        await this.refreshToken();
        return (await fetch(url, {
            headers: {
                authorization: this.token,
                accept: "application/json",
                "content-type": "application/json"
            },
            method: "POST",
            body: body
        })).json<T>();
    }

    protected async getPlaylistMetadata(id: string, limit = 50) {
        return this.fetch<SpotifyPlaylistMetadata>(`https://api-partner.spotify.com/pathfinder/v1/query?operationName=fetchPlaylistMetadata&variables=%7B%22uri%22%3A%22spotify%3Aplaylist%3A${id}%22%2C%22offset%22%3A0%2C%22limit%22%3A${limit}%7D&extensions=%7B%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%226f7fef1ef9760ba77aeb68d8153d458eeec2dce3430cef02b5f094a8ef9a465d%22%7D%7D`);
    }

    protected async getPlaylistContents(id: string, limit = 50) {
        return this.fetch<SpotifyPlaylistContents>(`https://api-partner.spotify.com/pathfinder/v1/query?operationName=fetchPlaylistContents&variables=%7B%22uri%22%3A%22spotify%3Aplaylist%3A${id}%22%2C%22offset%22%3A0%2C%22limit%22%3A${limit}%7D&extensions=%7B%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%22c56c706a062f82052d87fdaeeb300a258d2d54153222ef360682a0ee625284d9%22%7D%7D`);
    }

    protected async getMyProfile() {
        if (!this.cookie) throw Error("no cookie provided");
        return this.fetch<SpotifyMyProfile>("https://api.spotify.com/v1/me");
    }

    protected async getMyProfileId() {
        return this.myProfileId === "" ? this.myProfileId = (await this.getMyProfile()).id : this.myProfileId;
    }

}