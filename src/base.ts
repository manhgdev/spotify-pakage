import { SpotifyMyProfile, SpotifyPlaylistContents, SpotifyPlaylistMetadata } from "./types";
import { spTokenManager } from './lib/spTokenManager.js';

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
            // Sử dụng spTokenManager để lấy token
            const accessData = await spTokenManager(this.cookie);
            const accessToken = accessData.token;
            const expirationTime = accessData.expirationTime;

            if (accessToken) {
                this.token = accessToken.startsWith('Bearer ') ? accessToken : "Bearer " + accessToken;
                // Set expiration time to 1 hour from now as default since spTokenManager handles caching
                this.tokenExpirationTimestampMs = expirationTime || Date.now() + (60 * 60 * 1000);
            } else {
                throw new Error("spTokenManager returned null or undefined token");
            }
        } catch (error) {
            console.error("Lỗi khi làm mới token:", error);
            throw error;
        }
    }

    private parseCookieString(cookieString: string): Record<string, string> {
        const cookies: Record<string, string> = {};
        cookieString.split(';').forEach(cookie => {
            const [key, value] = cookie.trim().split('=');
            if (key && value) {
                cookies[key] = value;
            }
        });
        return cookies;
    }

    protected async fetch<T>(url: string, optionalHeaders?: { [index: string]: string; }) {
        await this.refreshToken();
        return (await fetch(url, {
            headers: { authorization: this.token, ...optionalHeaders }
        })).json() as T;
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
        })).json() as T;
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