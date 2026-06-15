import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  const regionUrl = process.env.OSS_API_REGION_URL || "https://api-stg.oss.go.id/stg/v1/ref/region/list";
  const userKey = process.env.OSS_API_USER_KEY || "f9c53f291ab3b47251ef5b001b4f6dcc";

  let url = "";

  if (type === "provinces") {
    url = `${regionUrl}/provinsi?visitorId`;
  } else if (type === "regencies" && id) {
    url = `${regionUrl}/kota?parent=${id}`;
  } else if (type === "districts" && id) {
    url = `${regionUrl}/kecamatan?parent=${id}`;
  } else if (type === "villages" && id) {
    url = `${regionUrl}/kelurahan?parent=${id}`;
  } else {
    return NextResponse.json({ error: "Invalid type or missing ID parameter" }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "user_key": userKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from remote region API: ${response.statusText}`);
    }

    const data = await response.json();

    if (Array.isArray(data)) {
      const mappedData = data.map((item: any) => ({
        id: item.region_id,
        name: item.nama,
      }));
      return NextResponse.json(mappedData);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Region API proxy error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch regions" }, { status: 500 });
  }
}
