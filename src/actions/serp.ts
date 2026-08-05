"use server";

export interface SerpResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
}

export interface SerpAnalysis {
  keyword: string;
  topResults: SerpResult[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  estimatedAvgWordCount: number;
  estimatedHeadingCount: number;
}

export async function fetchSerpAnalysis(keyword: string): Promise<{ success: boolean; data?: SerpAnalysis; error?: string }> {
  try {
    const key = "efdd31e031ae0b380b32115cd2e9b3b1337a46b6";
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: keyword,
        gl: "us",
        hl: "en",
        num: 10,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch SERP analysis: ${res.statusText}`);
    }

    const json = await res.json();

    const topResults: SerpResult[] = (json.organic || []).map((item: any) => ({
      position: item.position,
      title: item.title,
      link: item.link,
      snippet: item.snippet,
    }));

    const peopleAlsoAsk: string[] = (json.peopleAlsoAsk || []).map((item: any) => item.question);
    const relatedSearches: string[] = (json.relatedSearches || []).map((item: any) => item.query);

    // Rough estimates based on top results content for simulation
    const estimatedAvgWordCount = 1800; 
    const estimatedHeadingCount = 15;

    const data: SerpAnalysis = {
      keyword,
      topResults,
      peopleAlsoAsk,
      relatedSearches,
      estimatedAvgWordCount,
      estimatedHeadingCount,
    };

    return { success: true, data };
  } catch (error: any) {
    console.error("Error fetching SERP analysis:", error);
    return { success: false, error: error.message };
  }
}
