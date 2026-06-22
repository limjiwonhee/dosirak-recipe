export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.' },
    });
  }

  const { q, relevanceLanguage, regionCode, pageToken } = req.query;
  if (!q) {
    return res.status(400).json({ error: { message: '검색어(q)가 필요합니다.' } });
  }

  let url =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&type=video&maxResults=12` +
    `&q=${encodeURIComponent(q)}` +
    `&key=${apiKey}`;

  if (relevanceLanguage) url += `&relevanceLanguage=${relevanceLanguage}`;
  if (regionCode) url += `&regionCode=${regionCode}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

  try {
    const ytRes = await fetch(url);
    const data = await ytRes.json();
    return res.status(ytRes.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: 'YouTube API 요청 실패: ' + err.message } });
  }
}
