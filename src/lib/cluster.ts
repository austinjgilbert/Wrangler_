/**
 * Cluster sanitized posts into themes based on topic overlap.
 */

function intersectionSize(a: string[], b: string[]): number {
  const setA = new Set(a);
  let count = 0;
  for (const item of b) {
    if (setA.has(item)) count += 1;
  }
  return count;
}

export function clusterByTopics(posts: Array<{ extractedTopics: string[] }>) {
  const clusters: Array<{ topics: string[]; posts: any[] }> = [];

  for (const post of posts) {
    let placed = false;
    for (const cluster of clusters) {
      if (intersectionSize(cluster.topics, post.extractedTopics) >= 2) {
        cluster.posts.push(post);
        cluster.topics = Array.from(new Set([...cluster.topics, ...post.extractedTopics]));
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({
        topics: post.extractedTopics.slice(0, 6),
        posts: [post],
      });
    }
  }

  return clusters;
}
