import {generateSitemaps} from "@/app/sitemaps/sitemap";
import {NextResponse} from "next/server";

function buildSitemapIndex(sitemaps: string[]) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

  for (const sitemapURL of sitemaps) {
    xml += "<sitemap>";
    xml += `<loc>${sitemapURL}</loc>`;
    xml += "</sitemap>";
  }

  xml += "</sitemapindex>";
  return xml;
}

export async function GET() {
  try {
    // Generate sitemaps
    const dynamicSitemaps = await generateSitemaps();

    // Combine static and dynamic sitemaps
    const sitemaps = [
      `https://www.joutes.app/sitemap.xml`,
      ...dynamicSitemaps.map(sitemap => `https://www.joutes.app/sitemaps/sitemap/${sitemap.id}.xml`),
    ];

    console.log('Generated sitemaps:', sitemaps);

    const sitemapIndexXML = buildSitemapIndex(sitemaps);

    return new NextResponse(sitemapIndexXML, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Length": Buffer.byteLength(sitemapIndexXML).toString(),
      },
    });
  } catch (error) {
    console.error('Error generating sitemap index:', error);
    return NextResponse.error();
  }
}