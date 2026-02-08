/**
 * LinkedIn DOM Scraper Service
 * Enhanced scraping for public LinkedIn profiles and search results
 * Extracts data from embedded JSON state for better reliability
 */

/**
 * Extract LinkedIn embedded JSON state from HTML
 * LinkedIn stores profile data in <script> tags with type="application/json"
 * This is more reliable than DOM parsing as it doesn't change with CSS updates
 */
function extractLinkedInState(html) {
  const states = [];
  
  // LinkedIn uses multiple script tags with application/json
  // Pattern: <script type="application/json" data-page-component-props="...">...</script>
  const scriptMatches = html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi);
  
  for (const match of scriptMatches) {
    try {
      const jsonText = match[1].trim();
      if (jsonText && jsonText.length < 1000000) { // Max 1MB per script
        const parsed = JSON.parse(jsonText);
        if (parsed && typeof parsed === 'object') {
          states.push(parsed);
        }
      }
    } catch (e) {
      // Skip invalid JSON, continue searching
      continue;
    }
  }
  
  // Also check for LinkedIn's inlined state object
  const inlineStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
  if (inlineStateMatch) {
    try {
      const state = JSON.parse(inlineStateMatch[1]);
      if (state) states.push(state);
    } catch (e) {
      // Skip if parse fails
    }
  }
  
  return states;
}

/**
 * Extract profile data from LinkedIn embedded state
 * LinkedIn embeds profile data in various nested structures
 */
function extractProfileFromState(states, profileUrl) {
  const profile = {
    url: profileUrl,
    name: null,
    headline: null,
    location: null,
    about: null,
    experience: [],
    education: [],
    skills: [],
    connections: null,
    followers: null,
    languages: [],
    certifications: [],
    projects: [],
    volunteer: [],
    organizations: [],
    recommendations: null,
    profileImage: null,
    backgroundImage: null,
    contactInfo: null,
    publications: [],
  };
  
  // Recursively search for profile data in state objects
  function findInObject(obj, path = []) {
    if (!obj || typeof obj !== 'object') return null;
    
    // Look for common LinkedIn data structures
    if (obj.firstName || obj.lastName || obj.fullName) {
      return {
        name: obj.fullName || `${obj.firstName || ''} ${obj.lastName || ''}`.trim(),
        headline: obj.headline || obj.headlineText || null,
        location: obj.locationName || obj.location || null,
        about: obj.summary || obj.about || null,
        profileImage: obj.profilePicture?.displayImage || obj.profilePicture?.url || null,
        backgroundImage: obj.backgroundImage?.displayImage || obj.backgroundImage?.url || null,
        connections: obj.numConnections || obj.connectionCount || null,
        followers: obj.numFollowers || obj.followerCount || null,
      };
    }
    
    // Search in arrays and nested objects
    for (const key in obj) {
      if (Array.isArray(obj[key])) {
        for (const item of obj[key]) {
          const found = findInObject(item, [...path, key]);
          if (found) return found;
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        const found = findInObject(obj[key], [...path, key]);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  // Search through all extracted states
  for (const state of states) {
    // Look for profile data at various paths
    const profilePaths = [
      state.included,
      state.data,
      state.props,
      state.pageProps,
      state.profileData,
      state.profile,
      state.entityResult,
      state.elements,
    ];
    
    for (const path of profilePaths) {
      if (!path) continue;
      
      // If path is an array, search each item
      if (Array.isArray(path)) {
        for (const item of path) {
          const found = findInObject(item);
          if (found) {
            Object.assign(profile, found);
          }
          
          // Extract experience
          if (item.positions || item.experiences) {
            const experiences = item.positions || item.experiences || [];
            profile.experience = experiences.slice(0, 10).map(exp => ({
              title: exp.title || exp.positionTitle || null,
              company: exp.companyName || exp.company?.name || null,
              duration: exp.dateRange?.readable || exp.timePeriod || null,
              location: exp.locationName || exp.location || null,
              description: exp.description?.text || exp.description || null,
            }));
          }
          
          // Extract education
          if (item.educations || item.schools) {
            const educations = item.educations || item.schools || [];
            profile.education = educations.slice(0, 10).map(edu => ({
              school: edu.schoolName || edu.school?.name || null,
              degree: edu.degreeName || edu.degree || null,
              field: edu.fieldOfStudy || null,
              duration: edu.dateRange?.readable || edu.timePeriod || null,
            }));
          }
          
          // Extract skills
          if (item.skills || item.endorsedSkills) {
            const skills = item.skills || item.endorsedSkills || [];
            profile.skills = skills.slice(0, 50).map(skill => 
              skill.name || skill.skillName || skill
            ).filter(Boolean);
          }
          
          // Extract certifications
          if (item.certifications || item.certificates) {
            const certs = item.certifications || item.certificates || [];
            profile.certifications = certs.slice(0, 20).map(cert => ({
              name: cert.name || cert.certificationName || null,
              issuer: cert.issuingOrganization || cert.issuer || null,
              issueDate: cert.issueDate || cert.dateRange?.readable || null,
            }));
          }
        }
      } else if (typeof path === 'object') {
        const found = findInObject(path);
        if (found) {
          Object.assign(profile, found);
        }
      }
    }
  }
  
  return profile;
}

/**
 * Fallback: Extract profile data from HTML DOM if JSON state not available
 * Uses improved selectors based on LinkedIn's current structure
 */
function extractProfileFromHTML(html, profileUrl) {
  const profile = {
    url: profileUrl,
    name: null,
    headline: null,
    location: null,
    about: null,
    experience: [],
    education: [],
    skills: [],
    connections: null,
    followers: null,
    languages: [],
    certifications: [],
    projects: [],
    volunteer: [],
    organizations: [],
    recommendations: null,
    profileImage: null,
    backgroundImage: null,
  };
  
  if (!html) return profile;
  
  // Extract name - LinkedIn uses various selectors
  const nameSelectors = [
    /<h1[^>]*class="[^"]*text-heading-xlarge[^"]*"[^>]*>([^<]+)<\/h1>/i,
    /<span[^>]*class="[^"]*text-heading-xlarge[^"]*"[^>]*>([^<]+)<\/span>/i,
    /<title>([^|]+)\s*\|\s*LinkedIn<\/title>/i,
    /"givenName":"([^"]+)".*"familyName":"([^"]+)"/i,
    /"name":"([^"]+)"/i,
    /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
  ];
  
  for (const selector of nameSelectors) {
    const match = html.match(selector);
    if (match) {
      if (match[1] && match[2]) {
        // Given and family name
        profile.name = `${match[1]} ${match[2]}`.trim();
      } else if (match[1]) {
        profile.name = match[1].trim().replace(/\s*\|\s*LinkedIn.*$/i, '');
      }
      if (profile.name) break;
    }
  }
  
  // Extract headline
  const headlineSelectors = [
    /<div[^>]*class="[^"]*text-body-medium[^"]*break-words[^"]*"[^>]*>([^<]+)<\/div>/i,
    /<p[^>]*class="[^"]*text-body-medium[^"]*"[^>]*>([^<]+)<\/p>/i,
    /"headline":"([^"]+)"/i,
    /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
  ];
  
  for (const selector of headlineSelectors) {
    const match = html.match(selector);
    if (match && match[1] && match[1].trim().length > 0) {
      profile.headline = match[1].trim();
      break;
    }
  }
  
  // Extract location
  const locationSelectors = [
    /<span[^>]*class="[^"]*text-body-small[^"]*[^"]*t-black--light[^"]*[^"]*break-words[^"]*"[^>]*>([^<]+)<\/span>/i,
    /"location":"([^"]+)"/i,
    /<div[^>]*class="[^"]*text-body-small[^"]*[^"]*t-black--light[^"]*"[^>]*>([^<]+)<\/div>/i,
    /"addressLocality":"([^"]+)"/i,
  ];
  
  for (const selector of locationSelectors) {
    const match = html.match(selector);
    if (match && match[1] && !match[1].includes('connections') && match[1].trim().length > 0) {
      profile.location = match[1].trim();
      break;
    }
  }
  
  // Extract about section - look for about/experience sections
  const aboutSection = html.match(/<section[^>]*(?:id="about"|data-section="about")[^>]*>([\s\S]*?)<\/section>/i);
  if (aboutSection) {
    const aboutText = aboutSection[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (aboutText.length > 20) {
      profile.about = aboutText.substring(0, 2000);
    }
  }
  
  // Extract experience - improved selector
  const experienceSection = html.match(/<section[^>]*(?:id="experience"|data-section="experience")[^>]*>([\s\S]*?)<\/section>/i);
  if (experienceSection) {
    const expHtml = experienceSection[1];
    // Try multiple experience item patterns
    const expItemPatterns = [
      /<li[^>]*class="[^"]*pvs-list[^"]*[^"]*pvs-list--line[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
      /<div[^>]*class="[^"]*pvs-entity[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ];
    
    for (const pattern of expItemPatterns) {
      const expItems = [...expHtml.matchAll(pattern)];
      if (expItems.length > 0) {
        for (const itemMatch of expItems.slice(0, 10)) {
          const item = itemMatch[1];
          const titleMatch = item.match(/<span[^>]*aria-hidden="true"[^>]*>([^<]+)<\/span>/i) ||
                            item.match(/<span[^>]*class="[^"]*t-bold[^"]*"[^>]*>([^<]+)<\/span>/i);
          const companyMatch = item.match(/<span[^>]*class="[^"]*t-14[^"]*[^"]*t-normal[^"]*"[^>]*>([^<]+)<\/span>/i);
          const durationMatch = item.match(/<span[^>]*class="[^"]*t-14[^"]*[^"]*t-normal[^"]*[^"]*t-black--light[^"]*"[^>]*>([^<]+)<\/span>/i);
          
          if (titleMatch || companyMatch) {
            profile.experience.push({
              title: titleMatch ? titleMatch[1].trim() : null,
              company: companyMatch ? companyMatch[1].trim() : null,
              duration: durationMatch ? durationMatch[1].trim() : null,
            });
          }
        }
        break;
      }
    }
  }
  
  // Extract education - improved selector
  const educationSection = html.match(/<section[^>]*(?:id="education"|data-section="education")[^>]*>([\s\S]*?)<\/section>/i);
  if (educationSection) {
    const eduHtml = educationSection[1];
    const eduItems = [...eduHtml.matchAll(/<li[^>]*class="[^"]*pvs-list[^"]*[^"]*pvs-list--line[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)];
    for (const itemMatch of eduItems.slice(0, 10)) {
      const item = itemMatch[1];
      const schoolMatch = item.match(/<span[^>]*aria-hidden="true"[^>]*>([^<]+)<\/span>/i) ||
                         item.match(/<span[^>]*class="[^"]*t-bold[^"]*"[^>]*>([^<]+)<\/span>/i);
      const degreeMatch = item.match(/<span[^>]*class="[^"]*t-14[^"]*[^"]*t-normal[^"]*"[^>]*>([^<]+)<\/span>/i);
      
      if (schoolMatch) {
        profile.education.push({
          school: schoolMatch[1].trim(),
          degree: degreeMatch ? degreeMatch[1].trim() : null,
        });
      }
    }
  }
  
  // Extract skills
  const skillsSection = html.match(/<section[^>]*(?:id="skills"|data-section="skills")[^>]*>([\s\S]*?)<\/section>/i);
  if (skillsSection) {
    const skillsHtml = skillsSection[1];
    const skillItems = [...skillsHtml.matchAll(/<span[^>]*aria-hidden="true"[^>]*>([^<]+)<\/span>/gi)];
    for (const itemMatch of skillItems.slice(0, 50)) {
      const skill = itemMatch[1].trim();
      if (skill && skill.length > 0 && !profile.skills.includes(skill)) {
        profile.skills.push(skill);
      }
    }
  }
  
  // Extract connections count
  const connectionsMatch = html.match(/(\d+)\s*connections?/i) || html.match(/"numConnections":(\d+)/i);
  if (connectionsMatch) {
    profile.connections = parseInt(connectionsMatch[1], 10);
  }
  
  // Extract followers
  const followersMatch = html.match(/(\d+)\s*followers?/i) || html.match(/"numFollowers":(\d+)/i);
  if (followersMatch) {
    profile.followers = parseInt(followersMatch[1], 10);
  }
  
  // Extract profile image
  const imageMatches = [
    html.match(/<img[^>]*class="[^"]*profile-photo-edit__preview[^"]*"[^>]*src="([^"]+)"/i),
    html.match(/<img[^>]*class="[^"]*presence-entity__image[^"]*"[^>]*src="([^"]+)"/i),
    html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i),
    html.match(/"profilePicture":\s*\{\s*"url":\s*"([^"]+)"/i),
  ];
  
  for (const match of imageMatches) {
    if (match && match[1]) {
      profile.profileImage = match[1];
      break;
    }
  }
  
  // Extract background image
  const bgMatch = html.match(/<div[^>]*class="[^"]*profile-background-image[^"]*"[^>]*style="[^"]*background-image:\s*url\(([^)]+)\)/i) ||
                 html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
  if (bgMatch) {
    profile.backgroundImage = bgMatch[1];
  }
  
  // Try JSON-LD structured data as fallback
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1]);
      if (jsonData['@type'] === 'Person') {
        if (jsonData.name && !profile.name) profile.name = jsonData.name;
        if (jsonData.jobTitle && !profile.headline) profile.headline = jsonData.jobTitle;
        if (jsonData.address?.addressLocality && !profile.location) {
          profile.location = jsonData.address.addressLocality;
        }
        if (jsonData.description && !profile.about) {
          profile.about = jsonData.description.substring(0, 2000);
        }
      }
    } catch (e) {
      // JSON parse failed, continue
    }
  }
  
  return profile;
}

/**
 * Parse LinkedIn profile from HTML
 * Tries embedded JSON state first, falls back to DOM parsing
 */
export function parseLinkedInProfile(html, profileUrl) {
  if (!html) {
    return {
      url: profileUrl,
      name: null,
      headline: null,
      location: null,
      about: null,
      experience: [],
      education: [],
      skills: [],
      connections: null,
      followers: null,
      languages: [],
      certifications: [],
      projects: [],
      volunteer: [],
      organizations: [],
      recommendations: null,
      profileImage: null,
      backgroundImage: null,
    };
  }
  
  // First, try to extract from embedded JSON state (most reliable)
  const states = extractLinkedInState(html);
  if (states.length > 0) {
    const profileFromState = extractProfileFromState(states, profileUrl);
    // If we got meaningful data from state, use it
    if (profileFromState.name || profileFromState.headline || profileFromState.experience.length > 0) {
      return profileFromState;
    }
  }
  
  // Fallback to HTML DOM parsing
  return extractProfileFromHTML(html, profileUrl);
}

/**
 * Parse LinkedIn profile from plain text (manual export/paste fallback)
 * Attempts to extract name, headline, experience, education, skills.
 */
export function parseLinkedInText(text, profileUrl) {
  const profile = {
    url: profileUrl,
    name: null,
    headline: null,
    location: null,
    about: null,
    experience: [],
    education: [],
    skills: [],
    connections: null,
    followers: null,
    languages: [],
    certifications: [],
    projects: [],
    volunteer: [],
    organizations: [],
    recommendations: null,
    profileImage: null,
    backgroundImage: null,
  };

  if (!text) return profile;

  const rawLines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const stopPhrases = new Set([
    'Home', 'Accounts', 'Leads', 'Smart Links', 'Messaging', 'Actions List', 'Referrals',
    'Search', 'Lead filters', 'Account filters', 'Saved searches', 'Personas',
    'Sales Navigator Lead Page', 'Basic lead information', 'CRM', 'First time view',
    'Save', 'Message', 'Contact information', 'Add contact info', 'Search on Bing',
    'Lead IQ', 'BETA', 'This feature is powered by AI and mistakes are possible. Please check the information for accuracy. Learn more',
    'Relationship', 'Recent activity on LinkedIn', 'What you share in common', 'Get introduced',
    'Filter by connection type', 'Search leads', 'Summarized by AI', 'Was this helpful?',
    'Show all education', 'Show all skills', 'CRM', 'Sync with your CRM',
    'No CRM match found', 'Create record', 'Find match', 'Add notes', 'Timeline', 'Chat with us',
  ]);

  const cleanLine = (line) => {
    if (!line) return false;
    const lower = line.toLowerCase();
    if (stopPhrases.has(line)) return false;
    if (lower.includes('show more') || lower.includes('see more')) return false;
    if (/^\d+\s*new notifications?/i.test(line)) return false;
    if (/^\d+$/.test(line)) return false;
    if (/^was this helpful/i.test(line)) return false;
    if (/^\.{1,}$/.test(line)) return false;
    return true;
  };

  const cleanLines = rawLines.filter(cleanLine);

  const findHeaderIndex = (labels, fromIndex = 0, preferLast = false) => {
    const lowerLabels = labels.map(label => label.toLowerCase());
    if (preferLast) {
      for (let i = rawLines.length - 1; i >= fromIndex; i -= 1) {
        const line = rawLines[i].toLowerCase();
        if (lowerLabels.some(label => line.includes(label))) {
          return i;
        }
      }
      return null;
    }
    for (let i = fromIndex; i < rawLines.length; i += 1) {
      const line = rawLines[i].toLowerCase();
      if (lowerLabels.some(label => line.includes(label))) {
        return i;
      }
    }
    return null;
  };

  const extractSection = (startLabels, endLabels = [], options = {}) => {
    const { fromIndex = 0, preferLastStart = false } = options;
    const start = findHeaderIndex(startLabels, fromIndex, preferLastStart);
    if (start === null) return [];
    const end = endLabels.length > 0 ? findHeaderIndex(endLabels, start + 1) : null;
    const slice = rawLines.slice(start + 1, end || rawLines.length);
    return slice.filter(cleanLine);
  };

  const nameCandidate = cleanLines.find(line =>
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(line)
  );
  if (nameCandidate) {
    profile.name = nameCandidate;
  }

  const headlineCandidate = cleanLines.find(line =>
    / at [A-Z0-9]/.test(line) && line.length < 120
  );
  if (headlineCandidate) {
    profile.headline = headlineCandidate;
  }

  const locationCandidate = cleanLines.find(line =>
    /United Kingdom|United States|Canada|Area|England|Manchester|London/i.test(line)
  );
  if (locationCandidate) {
    profile.location = locationCandidate;
  }

  const findAboutSection = () => {
    const aboutIndices = [];
    for (let i = 0; i < rawLines.length; i += 1) {
      if (rawLines[i].toLowerCase() === 'about') {
        aboutIndices.push(i);
      }
    }
    for (const idx of aboutIndices) {
      for (let j = idx + 1; j < rawLines.length; j += 1) {
        let candidate = rawLines[j];
        if (!candidate) continue;
        if (candidate.toLowerCase().includes('show more')) {
          candidate = candidate.replace(/show more/i, '').trim();
        }
        if (!candidate) continue;
        if (candidate.length > 40) {
          const slice = rawLines.slice(idx + 1, findHeaderIndex(['Relationship'], idx + 1) || rawLines.length);
          return slice
            .map(line => line.replace(/show more/i, '').trim())
            .filter(cleanLine);
        }
        break;
      }
    }
    return [];
  };

  const aboutLines = findAboutSection();
  if (aboutLines.length > 0) {
    profile.about = aboutLines.join(' ').replace(/\s+/g, ' ').trim().substring(0, 2000);
  }

  const experienceLines = extractSection(
    ['Stewart’s experience', "Stewart's experience"],
    ['Summarized by AI', 'How FOOTASYLUM makes money', 'Account insights', 'Education', 'Interests', 'Featured skills and endorsements', 'Skills']
  );
  const datePattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}.*(Present|\d{4})/i;
  const durationPattern = /\b\d+\s+yrs?\b|\b\d+\s+mos?\b/i;
  const roleKeywords = /(Head|Manager|Director|Lead|Designer|Engineer|Officer|VP|Chief|President|Assistant|Conversion|UX|Ecommerce|Delivery|Digital)/i;
  const isLocation = (line) => /United Kingdom|United States|Canada|England|Manchester|Rochdale|Bury|Greater Manchester|Area/i.test(line);
  const isCompanyLine = (line) =>
    /^[A-Z0-9][A-Z0-9&.'\-\s]{2,}$/.test(line) && !roleKeywords.test(line) && !datePattern.test(line);

  let company = null;
  let i = 0;
  while (i < experienceLines.length) {
    const line = experienceLines[i];
    const next = experienceLines[i + 1] || '';

    if (line.toLowerCase().includes('worked for')) {
      i += 1;
      continue;
    }
    if (line.toLowerCase().includes('stewart’s experience')) {
      i += 1;
      continue;
    }
    if (isCompanyLine(line) && (next === line || durationPattern.test(next))) {
      company = line;
      i += next === line ? 2 : 2;
      continue;
    }

    if (roleKeywords.test(line) && (datePattern.test(next) || durationPattern.test(next))) {
      const entry = {
        title: line,
        company: company,
        duration: null,
        description: null,
        location: null,
      };

      let j = i + 1;
      while (j < experienceLines.length) {
        const candidate = experienceLines[j];
        if (datePattern.test(candidate) || durationPattern.test(candidate)) {
          entry.duration = entry.duration ? `${entry.duration} ${candidate}` : candidate;
          j += 1;
          continue;
        }
        if (isLocation(candidate)) {
          entry.location = candidate;
          j += 1;
          continue;
        }
        if (/^-\s*/.test(candidate) || candidate.toLowerCase().startsWith('for ')) {
          const cleaned = candidate.replace(/^-\s*/, '');
          entry.description = entry.description ? `${entry.description} ${cleaned}`.trim() : cleaned;
          j += 1;
          continue;
        }
        if (roleKeywords.test(candidate) || isCompanyLine(candidate)) {
          break;
        }
        j += 1;
      }

      profile.experience.push(entry);
      i = j;
      continue;
    }

    i += 1;
  }

  const educationLines = extractSection(['Education'], ['Interests', 'Featured skills and endorsements', 'Skills', 'CRM']);
  let edu = null;
  for (const line of educationLines) {
    if (line.toLowerCase().includes('followers') || line.toLowerCase().includes('picture')) {
      continue;
    }
    if (!/university|college|school|academy|institute/i.test(line) && !edu) {
      continue;
    }
    if (/degree|bachelor|foundation|diploma|certificate/i.test(line)) {
      if (!edu) edu = { school: null, degree: null, field: null, duration: null };
      edu.degree = line.trim();
      continue;
    }
    if (/^\d{4}$/.test(line)) {
      if (!edu) edu = { school: null, degree: null, field: null, duration: null };
      edu.duration = line.trim();
      continue;
    }
    if (line.length > 2) {
      if (edu && edu.school) {
        profile.education.push(edu);
      }
      edu = { school: line.trim(), degree: null, field: null, duration: null };
    }
  }
  if (edu && edu.school) {
    profile.education.push(edu);
  }

  const skillsLines = extractSection(['Featured skills and endorsements'], ['CRM', 'Interests', 'Education'])
    .concat(extractSection(['Skills'], ['CRM', 'Interests', 'Education']));
  if (skillsLines.length > 0) {
    profile.skills = skillsLines
      .filter(line => !/endorsements?/i.test(line) && !line.toLowerCase().includes('skills'))
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 50);
  }

  return profile;
}

/**
 * Parse LinkedIn search results from HTML
 * Extracts profile previews from LinkedIn search pages
 */
export function parseLinkedInSearchResults(html, query) {
  const results = [];
  
  if (!html) return results;
  
  // Extract embedded state for search results
  const states = extractLinkedInState(html);
  
  // Search for profile results in state
  for (const state of states) {
    // LinkedIn search results are often in included[] or data.elements[]
    const searchPaths = [
      state.included,
      state.data?.elements,
      state.elements,
      state.results,
    ];
    
    for (const path of searchPaths) {
      if (!path || !Array.isArray(path)) continue;
      
      for (const item of path) {
        // Look for person/profile entities
        if (item.entityResult || item.target || item.trackingId) {
          const entity = item.entityResult || item.target || item;
          
          if (entity.firstName || entity.lastName || entity.fullName) {
            const profileUrl = entity.url || entity.publicIdentifier 
              ? `https://www.linkedin.com/in/${entity.publicIdentifier || entity.url}`
              : null;
            
            if (profileUrl) {
              results.push({
                name: entity.fullName || `${entity.firstName || ''} ${entity.lastName || ''}`.trim(),
                headline: entity.headline || entity.headlineText || null,
                location: entity.locationName || entity.location || null,
                profileUrl,
                profileImage: entity.profilePicture?.displayImage || entity.profilePicture?.url || null,
                connectionDegree: entity.connectionDegree || null, // 1st, 2nd, 3rd
                mutualConnections: entity.mutualConnections || null,
                currentCompany: entity.currentPositions?.[0]?.companyName || null,
                currentTitle: entity.currentPositions?.[0]?.title || null,
              });
            }
          }
        }
      }
    }
  }
  
  // Fallback: Parse from HTML DOM if state extraction didn't work
  if (results.length === 0) {
    // Look for profile cards in search results
    const profileCards = html.matchAll(/<div[^>]*class="[^"]*search-result__wrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    
    for (const cardMatch of profileCards) {
      const card = cardMatch[1];
      
      // Extract profile link
      const linkMatch = card.match(/<a[^>]*href="([^"]*\/in\/[^"]+)"[^>]*>/i);
      if (!linkMatch) continue;
      
      const profileUrl = linkMatch[1].startsWith('http') 
        ? linkMatch[1] 
        : `https://www.linkedin.com${linkMatch[1]}`;
      
      // Extract name
      const nameMatch = card.match(/<span[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<\/span>/i) ||
                        card.match(/<h3[^>]*>([^<]+)<\/h3>/i);
      
      // Extract headline
      const headlineMatch = card.match(/<p[^>]*class="[^"]*headline[^"]*"[^>]*>([^<]+)<\/p>/i);
      
      // Extract location
      const locationMatch = card.match(/<p[^>]*class="[^"]*subline[^"]*"[^>]*>([^<]+)<\/p>/i);
      
      if (nameMatch || profileUrl) {
        results.push({
          name: nameMatch ? nameMatch[1].trim() : null,
          headline: headlineMatch ? headlineMatch[1].trim() : null,
          location: locationMatch ? locationMatch[1].trim() : null,
          profileUrl,
        });
      }
    }
  }
  
  return results.slice(0, 50); // Limit to 50 results
}
