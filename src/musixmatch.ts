export namespace Musixmatch {

    export async function search(terms: string) {
        const searchResponse = await (await fetch(`https://www.musixmatch.com/search/?query=${encodeURIComponent(terms)}`)).text();
        const buildId = searchResponse.match(/"buildId":"([^"]+)"/);
        const query = searchResponse.match(/"query":"([^"]+)"/);
        const trackResponse = await (await fetch(`https://www.musixmatch.com/_next/data/${buildId![1]}/en/search.json?query${encodeURIComponent(query![1])}`)).json() as any;
        return trackResponse.pageProps.data.comSearchBrowseGet.data.mxmComSearchBrowse;
    }

    export async function getLyricsFromUrl(url: string) {
        const trackResponse = await (await fetch(url)).text();
        const lyricsMatch = trackResponse.match(/"body":"([^"]+)"/);
        if (!lyricsMatch) throw new Error("Not found lyrics");
        return lyricsMatch[1].split("\\n");
    }

    export async function searchLyrics(terms: string) {
        throw new Error("Comming soon...");
        const searchResponse = await (await fetch(`https://www.musixmatch.com/search?query=${encodeURIComponent(terms)}`)).text();
        const buildId = searchResponse.match(/"buildId":"([^"]+)"/);
        const query = searchResponse.match(/"query":"([^"]+)"/);
        const trackResponse = await (await fetch(`https://www.musixmatch.com/_next/data/${buildId![1]}/en/lyrics/${encodeURIComponent(query![1])}.json`)).json() as any;
        return trackResponse.pageProps.data.trackInfo.data.lyrics.body;
        
    }

}