/**
 * Transcript cleaning utilities.
 * Assumption: lines may include timestamps like "00:01:23" or "1:23".
 */

const TIMESTAMP_REGEX = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/;

export function parseTranscript(transcript: string) {
  const lines = transcript.split('\n').map((l) => l.trim()).filter(Boolean);
  const entries: Array<{ timestamp: string; speaker: string; text: string }> = [];
  for (const line of lines) {
    const tsMatch = line.match(TIMESTAMP_REGEX);
    const timestamp = tsMatch ? tsMatch[1] : '00:00';
    const noTs = line.replace(TIMESTAMP_REGEX, '').trim();
    const speakerSplit = noTs.split(':');
    let speaker = 'Unknown';
    let text = noTs;
    if (speakerSplit.length > 1) {
      speaker = speakerSplit[0].trim();
      text = speakerSplit.slice(1).join(':').trim();
    }
    entries.push({ timestamp, speaker, text });
  }
  return entries;
}

export function cleanTranscript(entries: Array<{ timestamp: string; speaker: string; text: string }>) {
  const cleaned = entries.map((e) => {
    const text = e.text
      .replace(/\b(um|uh|like|you know)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return `${e.timestamp} ${e.speaker}: ${text}`;
  });
  return cleaned.join('\n');
}
