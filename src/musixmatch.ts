import fs from 'fs';
import path from 'path';
import os from 'os';

interface TokenData {
    user_token: string;
    expiration_time: number;
    created_at: number;
}

interface LyricsResult {
    success: boolean;
    lyrics?: string;
    error?: string;
    isError: boolean;
    query?: string;
    originalError?: string;
}

class MusixMatchLyrics {
    private tokenUrl: string;
    private searchTermUrl: string;
    private lyricsUrl: string;
    private lyricsAlternativeUrl: string;
    private tokenFile: string;

    constructor() {
        this.tokenUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0';
        this.searchTermUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/macro.search?app_id=web-desktop-app-v1.0&page_size=5&page=1&s_track_rating=desc&quorum_factor=1.0';
        this.lyricsUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0&subtitle_format=lrc';
        this.lyricsAlternativeUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&namespace=lyrics_richsynched&subtitle_format=mxm&app_id=web-desktop-app-v1.0';
        this.tokenFile = path.join(os.tmpdir(), 'musix_token.json');
    }

    /**
     * Make HTTP GET request
     */
    private async get(url: string): Promise<string> {
        try {
            const headers = {
                'authority': 'apic-desktop.musixmatch.com',
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'cache-control': 'no-cache',
                'cookie': 'AWSELBCORS=0; AWSELB=0;',
                'origin': 'https://www.musixmatch.com',
                'pragma': 'no-cache',
                'referer': 'https://www.musixmatch.com/',
                'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            };

            // Add a random delay to mimic human behavior
            const delay = Math.floor(Math.random() * 1500) + 500;
            await new Promise(resolve => setTimeout(resolve, delay));

            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.text();
        } catch (error: any) {
            throw new Error(`Request failed: ${error.message}`);
        }
    }

    /**
     * Get and cache access token
     */
    private async getToken(): Promise<string> {
        try {
            const result = await this.get(this.tokenUrl);

            if (!result) {
                throw new Error('Failed to retrieve the access token.');
            }

            const tokenJson = JSON.parse(result);

            if (tokenJson.message.header.status_code !== 200) {
                if (tokenJson.message.header.hint === 'captcha') {
                    throw new Error(
                        'Musixmatch API is requesting CAPTCHA verification. ' +
                        'This typically happens when there are too many requests from the same IP address. ' +
                        'Try again later or visit the Musixmatch website directly to solve the CAPTCHA.'
                    );
                }

                throw new Error(`Failed to get token: Status code ${tokenJson.message.header.status_code}`);
            }

            const currentTime = Math.floor(Date.now() / 1000);
            const newToken = tokenJson.message.body.user_token;
            const expirationTime = currentTime + 600; // 10 minutes

            const tokenData: TokenData = {
                user_token: newToken,
                expiration_time: expirationTime,
                created_at: currentTime
            };

            // Write token to file
            fs.writeFileSync(this.tokenFile, JSON.stringify(tokenData, null, 2));

            return newToken;
        } catch (error: any) {
            throw new Error(`Token retrieval failed: ${error.message}`);
        }
    }

    /**
     * Check if token is expired and refresh if needed
     */
    private async checkTokenExpire(): Promise<boolean> {
        let tokenExists = false;
        let timeNow = Math.floor(Date.now() / 1000);
        let timeLeft = 0;
        let tokenData: TokenData | null = null;

        try {
            tokenExists = fs.existsSync(this.tokenFile);
            if (tokenExists) {
                try {
                    tokenData = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
                    timeLeft = tokenData?.expiration_time || 0;
                } catch (e) {
                    tokenExists = false;
                }
            }

            const tokenExpired = !tokenExists || timeLeft <= timeNow;
            const tokenMissing = !tokenExists || !tokenData || !tokenData.user_token;

            if (tokenExpired || tokenMissing) {
                await this.getToken();
                return true;
            } else {
                return false;
            }
        } catch (error) {
            await this.getToken();
            return true;
        }
    }

    /**
     * Get stored token
     */
    private getStoredToken(): string {
        try {
            if (!fs.existsSync(this.tokenFile)) {
                throw new Error('Token file not found');
            }

            const fileContent = fs.readFileSync(this.tokenFile, 'utf8');
            if (!fileContent || fileContent.trim() === '') {
                throw new Error('Token file is empty');
            }

            const tokenData: TokenData = JSON.parse(fileContent);

            if (!tokenData || !tokenData.user_token) {
                throw new Error('Token data is invalid');
            }

            return tokenData.user_token;
        } catch (error: any) {
            throw new Error(`Failed to get stored token: ${error.message}`);
        }
    }

    /**
     * Search for track and return track ID
     */
    private async searchTrack(query: string): Promise<string> {
        const tokenRefreshed = await this.checkTokenExpire();

        const token = this.getStoredToken();
        const formattedUrl = `${this.searchTermUrl}&q=${encodeURIComponent(query)}&usertoken=${token}`;

        try {
            const result = await this.get(formattedUrl);
            const listResult = JSON.parse(result);

            if (listResult.message && listResult.message.header) {
                const statusCode = listResult.message.header.status_code;
                const hint = listResult.message.header.hint || 'Unknown error';

                if (statusCode === 401) {
                    if (hint === 'captcha') {
                        throw new Error(
                            'Musixmatch API is requesting CAPTCHA verification. ' +
                            'This typically happens when there are too many requests from the same IP address. ' +
                            'Try again later or visit the Musixmatch website directly to solve the CAPTCHA.'
                        );
                    }

                    if (!tokenRefreshed) {
                        await this.getToken();
                        const newToken = this.getStoredToken();
                        const newUrl = `${this.searchTermUrl}&q=${encodeURIComponent(query)}&usertoken=${newToken}`;
                        const newResult = await this.get(newUrl);
                        return this.processSearchResult(newResult, query);
                    } else {
                        throw new Error(`Authentication failed with status code ${statusCode}: ${hint}`);
                    }
                }

                if (statusCode !== 200) {
                    throw new Error(`API returned status code ${statusCode}: ${hint}`);
                }
            }

            return this.processSearchResult(result, query);
        } catch (error: any) {
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    /**
     * Process search result and extract track ID
     */
    private processSearchResult(resultData: string, query: string): string {
        const listResult = JSON.parse(resultData);

        if (!listResult.message || !listResult.message.body ||
            !listResult.message.body.macro_result_list ||
            !listResult.message.body.macro_result_list.track_list) {
            throw new Error('Invalid API response structure');
        }

        // Find the best match
        for (const track of listResult.message.body.macro_result_list.track_list) {
            const trackObj = track.track;
            const trackName = `${trackObj.track_name} ${trackObj.artist_name}`;

            if (query.toLowerCase().includes(trackName.toLowerCase()) ||
                trackName.toLowerCase().includes(query.toLowerCase())) {
                return trackObj.track_id;
            }
        }

        // If no exact match, return the first result
        return listResult.message.body.macro_result_list.track_list[0].track.track_id;
    }

    /**
     * Get lyrics by track ID
     */
    private async getLyrics(trackId: string): Promise<string> {
        await this.checkTokenExpire();

        const token = this.getStoredToken();
        const formattedUrl = `${this.lyricsUrl}&track_id=${trackId}&usertoken=${token}`;

        try {
            const result = await this.get(formattedUrl);
            const lyricsData = JSON.parse(result);

            if (!lyricsData.message.body.subtitle) {
                throw new Error('No lyrics found for this track');
            }

            return lyricsData.message.body.subtitle.subtitle_body;
        } catch (error: any) {
            throw new Error(`Failed to get lyrics: ${error.message}`);
        }
    }

    /**
     * Get lyrics using alternative method (by title, artist, and optional duration)
     */
    public async getLyricsAlternative(title: string, artist: string, duration: number | null = null): Promise<string> {
        await this.checkTokenExpire();

        const token = this.getStoredToken();
        let formattedUrl: string;

        if (duration !== null) {
            formattedUrl = `${this.lyricsAlternativeUrl}&usertoken=${token}&q_album=&q_artist=${encodeURIComponent(artist)}&q_artists=${encodeURIComponent(artist)}&q_track=${encodeURIComponent(title)}&q_duration=${duration}&f_subtitle_length=${duration}`;
        } else {
            formattedUrl = `${this.lyricsAlternativeUrl}&usertoken=${token}&q_album=&q_artist=${encodeURIComponent(artist)}&q_artists=${encodeURIComponent(artist)}&q_track=${encodeURIComponent(title)}`;
        }

        try {
            const result = await this.get(formattedUrl);
            const lyrics = JSON.parse(result);

            const subtitleData = lyrics.message.body.macro_calls['track.subtitles.get'];
            if (!subtitleData.message.body.subtitle_list || subtitleData.message.body.subtitle_list.length === 0) {
                throw new Error('No lyrics found for this track');
            }

            const track2 = subtitleData.message.body.subtitle_list[0].subtitle.subtitle_body;
            return this.getLrcLyrics(track2);
        } catch (error: any) {
            throw new Error(`Failed to get lyrics (alternative): ${error.message}`);
        }
    }

    /**
     * Convert subtitle data to LRC format
     */
    private getLrcLyrics(lyricsData: string): string {
        try {
            const data = JSON.parse(lyricsData);
            let lrc = '';

            if (data && Array.isArray(data)) {
                for (const item of data) {
                    const minutes = String(item.time.minutes).padStart(2, '0');
                    const seconds = String(item.time.seconds).padStart(2, '0');
                    const hundredths = String(item.time.hundredths).padStart(2, '0');
                    const text = item.text || '♪';

                    lrc += `[${minutes}:${seconds}.${hundredths}]${text}\n`;
                }
            }

            return lrc;
        } catch (error: any) {
            throw new Error(`Failed to parse lyrics: ${error.message}`);
        }
    }

    /**
     * Convert duration from mm:ss format to seconds
     */
    public static convertDuration(time: string): number | null {
        if (!time || typeof time !== 'string') {
            return null;
        }

        const parts = time.split(':');
        if (parts.length !== 2) {
            return null;
        }

        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);

        return (minutes * 60) + seconds;
    }

    /**
     * Get lyrics using default method (search by query)
     */
    public async getLyricsDefault(query: string): Promise<string> {
        try {
            const trackId = await this.searchTrack(query);
            return await this.getLyrics(trackId);
        } catch (error: any) {
            throw new Error(`Failed to get lyrics (default method): ${error.message}`);
        }
    }
}

/**
 * MusixMatch API wrapper class
 */
class MusixMatchAPI {
    private musix: MusixMatchLyrics;

    constructor() {
        this.musix = new MusixMatchLyrics();
    }

    /**
     * Get lyrics using default method
     */
    public async getLyricsDefault(query: string): Promise<LyricsResult> {
        try {
            if (!query || typeof query !== 'string' || query.trim() === '') {
                return {
                    success: false,
                    error: 'Search query cannot be empty',
                    isError: true
                };
            }

            const lyrics = await this.musix.getLyricsDefault(query);

            return {
                success: true,
                lyrics: lyrics,
                isError: false,
                query: query
            };
        } catch (error: any) {
            let userFriendlyMessage = error.message;

            if (error.message.includes('captcha')) {
                userFriendlyMessage = 'The Musixmatch API is temporarily unavailable due to CAPTCHA protection. Please try again later.';
            } else if (error.message.includes('401')) {
                userFriendlyMessage = 'Authentication error with the Musixmatch API. Please try again later.';
            } else if (error.message.includes('No tracks found') || error.message.includes('Invalid API response structure')) {
                userFriendlyMessage = `No lyrics found for "${query}". Please try a different search term.`;
            }

            return {
                success: false,
                error: userFriendlyMessage,
                originalError: error.message,
                isError: true,
                query: query
            };
        }
    }

    /**
     * Get lyrics using alternative method
     */
    public async getLyricsAlternative(title: string, artist: string, duration: string | number | null = null): Promise<LyricsResult> {
        try {
            let durationSeconds: number | null = null;

            if (duration) {
                // Try to convert if it's in mm:ss format
                if (typeof duration === 'string' && duration.includes(':')) {
                    durationSeconds = MusixMatchLyrics.convertDuration(duration);
                } else {
                    durationSeconds = parseInt(duration.toString(), 10);
                }
            }

            const lyrics = await this.musix.getLyricsAlternative(title, artist, durationSeconds);

            return {
                success: true,
                lyrics: lyrics,
                isError: false
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                isError: true
            };
        }
    }
}

// Create global instance
const musixAPI = new MusixMatchAPI();

export namespace Musixmatch {
    export async function search(terms: string) {
        // Legacy method - keeping for backward compatibility
        const searchResponse = await (await fetch(`https://www.musixmatch.com/search/?query=${encodeURIComponent(terms)}`)).text();
        const buildId = searchResponse.match(/"buildId":"([^"]+)"/);
        const query = searchResponse.match(/"query":"([^"]+)"/);
        const trackResponse = await (await fetch(`https://www.musixmatch.com/_next/data/${buildId![1]}/en/search.json?query${encodeURIComponent(query![1])}`)).json() as any;
        // console.log(trackResponse);
        return trackResponse.pageProps.data.comSearchBrowseGet.data.mxmComSearchBrowse;
    }

    export async function getLyricsFromUrl(url: string) {
        // Legacy method - keeping for backward compatibility
        const trackResponse = await (await fetch(url)).text();
        const lyricsMatch = trackResponse.match(/"body":"([^"]+)"/);
        if (!lyricsMatch) throw new Error("Not found lyrics");
        return lyricsMatch[1].split("\\n");
    }

    export async function searchLyrics(terms: string): Promise<string[]> {
        // New implementation using MusixMatch API
        try {
            const result = await musixAPI.getLyricsDefault(terms);
            return result.lyrics ? result.lyrics.split('\n') : [];
        } catch (error: any) {
            throw new Error(error.message || "Failed to get lyrics");
        }
    }

    export async function getLyricsAlternative(title: string, artist: string, duration?: string | number): Promise<string[]> {
        // New implementation using MusixMatch API alternative method
        try {
            const result = await musixAPI.getLyricsAlternative(title, artist, duration || null);
            // console.log(result);
            return result.lyrics ? result.lyrics.split('\n') : [];
        } catch (error: any) {
            throw new Error(error.message || "Failed to get lyrics");
        }
    }
}