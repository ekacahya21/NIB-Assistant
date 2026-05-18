import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  let url = "";

  if (type === "provinces") {
    url = "https://emsifa.github.io/api-wilayah-indonesia/api/provinces.json";
  } else if (type === "regencies" && id) {
    url = `https://emsifa.github.io/api-wilayah-indonesia/api/regencies/${id}.json`;
  } else if (type === "districts" && id) {
    url = `https://emsifa.github.io/api-wilayah-indonesia/api/districts/${id}.json`;
  } else if (type === "villages" && id) {
    url = `https://emsifa.github.io/api-wilayah-indonesia/api/villages/${id}.json`;
  } else {
    return NextResponse.json({ error: "Invalid type or missing ID parameter" }, { status: 400 });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch from remote region API: ${response.statusText}`);
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Region API proxy error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch regions" }, { status: 500 });
  }
}
