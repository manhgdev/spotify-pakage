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
            const [totp, ts] = this.generateToken();

            const params = new URLSearchParams({
                reason: "transport",
                productType: "embed",
                totp,
                totpVer: "5",
                ts: ts.toString()
            });
            const tokenUrl = `https://open.spotify.com/get_access_token?${params.toString()}`;
            
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

    private generateToken(): [string, number] {
        const totpSecret = new Uint8Array([
            53, 53, 48, 55, 49, 52, 53, 56, 53, 51, 52, 56, 55, 52, 57, 57,
            53, 57, 50, 50, 52, 56, 54, 51, 48, 51, 50, 57, 51, 52, 55
        ]);
    
        // Note for  me: Can also be used from Buffer.from("5507145853487499592248630329347", 'utf8');
    
        const timeStep = Math.floor(Date.now() / 30000);
        const counter = new Uint8Array(8);
        const counterView = new DataView(counter.buffer);
        counterView.setBigInt64(0, BigInt(timeStep));
    
        const hmac = crypto.createHmac('sha1', totpSecret);
        hmac.update(counter);
        const hash = hmac.digest();
        const offset = hash[hash.length - 1] & 0x0f;
        const binCode =
            ((hash[offset] & 0x7f) << 24) |
            ((hash[offset + 1] & 0xff) << 16) |
            ((hash[offset + 2] & 0xff) << 8) |
            (hash[offset + 3] & 0xff);
        const token = (binCode % 1000000).toString().padStart(6, '0');
        return [token, timeStep * 30000];
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