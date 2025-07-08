import fs from 'fs';

class MusixMatchLyrics {
    constructor() {
        this.tokenUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0';
        this.searchTermUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/macro.search?app_id=web-desktop-app-v1.0&page_size=5&page=1&s_track_rating=desc&quorum_factor=1.0';
        this.lyricsUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0&subtitle_format=lrc';
        this.lyricsAlternativeUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&namespace=lyrics_richsynched&subtitle_format=mxm&app_id=web-desktop-app-v1.0';
        this.tokenFile = 'musix_token.json';
    }

    /**
     * Make HTTP GET request
     * @param {string} url - The URL to fetch
     * @returns {Promise<string>} - Response data
     */
    async get(url) {
        try {
            // More realistic browser headers
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
            
            // Add a random delay to mimic human behavior (between 500ms and 2000ms)
            const delay = Math.floor(Math.random() * 1500) + 500;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            console.log(`Requesting: ${url}`);
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                timeout: 10000 // 10 seconds timeout is more realistic
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.text();
        } catch (error) {
            throw new Error(`Request failed: ${error.message}`);
        }
    }

    /**
     * Get and cache access token
     */
    async getToken() {
        try {
            console.log('Requesting new token from Musixmatch API...');
            const result = await this.get(this.tokenUrl);
            
            if (!result) {
                throw new Error('Failed to retrieve the access token.');
            }

            const tokenJson = JSON.parse(result);
            
            if (tokenJson.message.header.status_code !== 200) {
                console.log('Token API response:', JSON.stringify(tokenJson, null, 2));
                
                // Handle captcha requirement specifically
                if (tokenJson.message.header.hint === 'captcha') {
                    throw new Error(
                        'Musixmatch API is requesting CAPTCHA verification. ' +
                        'This typically happens when there are too many requests from the same IP address. ' +
                        'Try again later or visit the Musixmatch website directly to solve the CAPTCHA.'
                    );
                }
                
                throw new Error(`Failed to get token: Status code ${tokenJson.message.header.status_code}`);
            }

            // Save the token to a cache file
            const currentTime = Math.floor(Date.now() / 1000);
            const newToken = tokenJson.message.body.user_token;
            const expirationTime = currentTime + 600; // 10 minutes
            
            const tokenData = {
                user_token: newToken,
                expiration_time: expirationTime,
                created_at: currentTime
            };

            console.log('New token acquired successfully');
            
            // Write token to file
            fs.writeFileSync(this.tokenFile, JSON.stringify(tokenData, null, 2));
            console.log(`Token saved to ${this.tokenFile}`);
            
            return newToken;
        } catch (error) {
            console.error('Token retrieval error:', error);
            throw new Error(`Token retrieval failed: ${error.message}`);
        }
    }

    /**
     * Check if token is expired and refresh if needed
     * @returns {boolean} - Whether a new token was fetched
     */
    async checkTokenExpire() {
        let tokenExists = false;
        let timeNow = Math.floor(Date.now() / 1000);
        let timeLeft = 0;
        let tokenData = null;

        try {
            // In Node.js environment only
            tokenExists = fs.existsSync(this.tokenFile);
            if (tokenExists) {
                try {
                    tokenData = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
                    timeLeft = tokenData.expiration_time || 0;
                } catch (e) {
                    console.log('Error reading token file:', e.message);
                    tokenExists = false;
                }
            }

            // Check if token is valid and not expired
            const tokenExpired = !tokenExists || timeLeft <= timeNow;
            const tokenMissing = !tokenExists || !tokenData || !tokenData.user_token;
            
            if (tokenExpired || tokenMissing) {
                console.log('Token expired or missing. Getting a new token...');
                await this.getToken();
                return true; // New token was fetched
            } else {
                console.log('Using existing token, valid for', timeLeft - timeNow, 'seconds');
                return false; // No new token needed
            }
        } catch (error) {
            console.error('Error in checkTokenExpire:', error);
            // In case of any error, try to get a new token
            await this.getToken();
            return true; // New token was fetched
        }
    }

    /**
     * Get stored token
     * @returns {string} - User token
     * @throws {Error} - If token is not found or invalid
     */
    getStoredToken() {
        try {
            // Node.js environment only
            if (!fs.existsSync(this.tokenFile)) {
                throw new Error('Token file not found');
            }
            
            const fileContent = fs.readFileSync(this.tokenFile, 'utf8');
            if (!fileContent || fileContent.trim() === '') {
                throw new Error('Token file is empty');
            }
            
            const tokenData = JSON.parse(fileContent);
            
            if (!tokenData || !tokenData.user_token) {
                throw new Error('Token data is invalid');
            }
            
            return tokenData.user_token;
        } catch (error) {
            console.error('Error retrieving stored token:', error.message);
            throw new Error(`Failed to get stored token: ${error.message}`);
        }
    }

    /**
     * Get lyrics by track ID
     * @param {string} trackId - The track ID
     * @returns {Promise<string>} - LRC formatted lyrics
     */
    async getLyrics(trackId) {
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
        } catch (error) {
            throw new Error(`Failed to get lyrics: ${error.message}`);
        }
    }

    /**
     * Get lyrics using alternative method (by title, artist, and optional duration)
     * @param {string} title - Song title
     * @param {string} artist - Artist name
     * @param {number|null} duration - Song duration in seconds (optional)
     * @returns {Promise<string>} - LRC formatted lyrics
     */
    async getLyricsAlternative(title, artist, duration = null) {
        await this.checkTokenExpire();
        
        const token = this.getStoredToken();
        let formattedUrl;
        
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
        } catch (error) {
            throw new Error(`Failed to get lyrics (alternative): ${error.message}`);
        }
    }

    /**
     * Process search result and extract track ID
     * @param {string} resultData - Raw API response
     * @param {string} query - Original search query
     * @returns {string} - Track ID
     * @private
     */
    processSearchResult(resultData, query) {
        const listResult = JSON.parse(resultData);
        
        // Check if the required data exists in the response
        if (!listResult.message || !listResult.message.body || 
            !listResult.message.body.macro_result_list || 
            !listResult.message.body.macro_result_list.track_list) {
            console.log('API Response Structure:', JSON.stringify(listResult, null, 2));
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
     * Search for track and return track ID
     * @param {string} query - Search query (title + artist)
     * @returns {Promise<string>} - Track ID
     */
    async searchTrack(query) {
        // Only check token expiration once, don't get a new token if it's still valid
        const tokenRefreshed = await this.checkTokenExpire();
        
        const token = this.getStoredToken();
        const formattedUrl = `${this.searchTermUrl}&q=${encodeURIComponent(query)}&usertoken=${token}`;
        
        try {
            const result = await this.get(formattedUrl);
            const listResult = JSON.parse(result);
            
            // Handle authentication errors
            if (listResult.message && listResult.message.header) {
                const statusCode = listResult.message.header.status_code;
                const hint = listResult.message.header.hint || 'Unknown error';
                
                if (statusCode === 401) {
                    console.log('API Response:', JSON.stringify(listResult, null, 2));
                    
                    if (hint === 'captcha') {
                        throw new Error(
                            'Musixmatch API is requesting CAPTCHA verification. ' +
                            'This typically happens when there are too many requests from the same IP address. ' +
                            'Try again later or visit the Musixmatch website directly to solve the CAPTCHA.'
                        );
                    } else if (hint === 'login_required') {
                        throw new Error(
                            'Musixmatch API requires authentication. ' +
                            'The API might have changed or is not accessible without a valid account. ' +
                            'Please check the API documentation for changes.'
                        );
                    }
                    
                    // General 401 error if we don't have a specific handler
                    if (!tokenRefreshed) {
                        console.log('Token invalid despite not being expired. Forcing token refresh...');
                        await this.getToken();
                        // Try the request again with the new token (but only once)
                        const newToken = this.getStoredToken();
                        const newUrl = `${this.searchTermUrl}&q=${encodeURIComponent(query)}&usertoken=${newToken}`;
                        const newResult = await this.get(newUrl);
                        return this.processSearchResult(newResult, query);
                    } else {
                        throw new Error(`Authentication failed with status code ${statusCode}: ${hint}`);
                    }
                }
                
                if (statusCode !== 200) {
                    console.log('API Response:', JSON.stringify(listResult, null, 2));
                    throw new Error(`API returned status code ${statusCode}: ${hint}`);
                }
            }
            
            return this.processSearchResult(result, query);
        } catch (error) {
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    /**
     * Convert subtitle data to LRC format
     * @param {string} lyricsData - Raw lyrics data
     * @returns {string} - LRC formatted lyrics
     */
    getLrcLyrics(lyricsData) {
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
        } catch (error) {
            throw new Error(`Failed to parse lyrics: ${error.message}`);
        }
    }

    /**
     * Convert duration from mm:ss format to seconds
     * @param {string} time - Time in mm:ss format
     * @returns {number} - Duration in seconds
     */
    static convertDuration(time) {
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
     * @param {string} query - Search query
     * @returns {Promise<string>} - LRC formatted lyrics
     */
    async getLyricsDefault(query) {
        try {
            const trackId = await this.searchTrack(query);
            return await this.getLyrics(trackId);
        } catch (error) {
            throw new Error(`Failed to get lyrics (default method): ${error.message}`);
        }
    }
}

// Example usage functions
class MusixMatchAPI {
    constructor() {
        this.musix = new MusixMatchLyrics();
    }

    /**
     * Get lyrics using alternative method
     * @param {string} title - Song title
     * @param {string} artist - Artist name
     * @param {string|null} duration - Duration in mm:ss format or seconds
     * @returns {Promise<Object>} - Result object with lyrics or error
     */
    async getLyricsAlternative(title, artist, duration = null) {
        try {
            let durationSeconds = null;
            
            if (duration) {
                // Try to convert if it's in mm:ss format
                if (duration.includes(':')) {
                    durationSeconds = MusixMatchLyrics.convertDuration(duration);
                } else {
                    durationSeconds = parseInt(duration, 10);
                }
            }
            
            const lyrics = await this.musix.getLyricsAlternative(title, artist, durationSeconds);
            
            return {
                success: true,
                lyrics: lyrics,
                isError: false
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                isError: true
            };
        }
    }

    /**
     * Get lyrics using default method
     * @param {string} query - Search query
     * @returns {Promise<Object>} - Result object with lyrics or error
     */
    async getLyricsDefault(query) {
        try {
            if (!query || typeof query !== 'string' || query.trim() === '') {
                return {
                    success: false,
                    error: 'Search query cannot be empty',
                    isError: true
                };
            }
            
            console.log(`Searching for lyrics: "${query}"`);
            const lyrics = await this.musix.getLyricsDefault(query);
            
            return {
                success: true,
                lyrics: lyrics,
                isError: false,
                query: query
            };
        } catch (error) {
            console.error('Error in getLyricsDefault:', error);
            
            // Check for specific error conditions
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
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MusixMatchLyrics,
        MusixMatchAPI
    };
}

// Usage examples:
async function examples() {
    const api = new MusixMatchAPI();
    
    // Example 1: Using alternative method
    console.log('=== Alternative Method ===');
    try {
        const result1 = await api.getLyricsAlternative('Hope', 'XXXTENTACION', '');
        if (result1.success) {
            console.log('Lyrics found:');
            console.log(result1.lyrics);
        } else {
            console.log('Error:', result1.error);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
    
    // Example 2: Using default method
    // console.log('\n=== Default Method ===');
    // try {
    //     const result2 = await api.getLyricsDefault('Hope XXXTENTACION');
    //     if (result2.success) {
    //         console.log('Lyrics found:');
    //         console.log(result2.lyrics);
    //     } else {
    //         console.log('Error:', result2.error);
    //     }
    // } catch (error) {
    //     console.error('Error:', error.message);
    // }
}

// Uncomment to run examples
examples();