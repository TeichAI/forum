import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Teich Forum";

export default function OpenGraphImage() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", background: "#11110f", color: "#fffaf0", padding: "72px", position: "relative" }}><div style={{ position: "absolute", right: "-80px", top: "-120px", width: "430px", height: "430px", borderRadius: "999px", background: "#ed7b26", opacity: 0.9 }} /><div style={{ position: "absolute", right: "130px", bottom: "-175px", width: "420px", height: "420px", borderRadius: "999px", border: "36px solid #f4b16d", opacity: 0.45 }} /><div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}><div style={{ display: "flex", alignItems: "center", fontSize: 27, letterSpacing: 3, color: "#f4b16d" }}>TEICH COMMUNITY</div><div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 92, lineHeight: 1.05, fontWeight: 800 }}>Teich Forum</div><div style={{ fontSize: 35, marginTop: 28, color: "#d5d0c7" }}>Ideas grow better when we share them.</div></div></div></div>, size);
}
