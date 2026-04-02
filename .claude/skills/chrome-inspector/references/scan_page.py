#!/usr/bin/env python3
"""
scan-page.py — Full chrome-inspector skill pipeline in pure Python.

This script takes raw page text + URL + title as input and performs:
1. Page type classification (LinkedIn, Salesforce, Crunchbase, etc.)
2. Structured data extraction into company/person profiles
3. Gap analysis with priority levels
4. Enrichment suggestions
5. StoredProfile JSON output
6. Local profile storage with merge logic

Usage as module:
    from scan_page import scan_page
    result = scan_page(url="https://...", title="...", page_text="...")

Usage as CLI:
    python3 scan-page.py --url "https://..." --title "..." --text-file /tmp/page.txt --output-dir ~/.chrome-inspector/profiles
"""

import json
import re
import os
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Union
from dataclasses import dataclass, asdict, field
from enum import Enum


# ============================================================================
# TYPE DEFINITIONS (matching TypeScript schemas)
# ============================================================================

class GapPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class Location:
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None


@dataclass
class Funding:
    total_raised: Optional[str] = None
    last_round: Optional[str] = None
    last_round_amount: Optional[str] = None
    last_round_date: Optional[str] = None
    investors: List[str] = field(default_factory=list)


@dataclass
class Social:
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None
    github_url: Optional[str] = None
    facebook_url: Optional[str] = None


@dataclass
class RevenueSignals:
    estimated_arr: Optional[str] = None
    pricing_model: Optional[str] = None  # "freemium", "enterprise", "usage-based"
    pricing_url: Optional[str] = None
    has_free_tier: Optional[bool] = None


@dataclass
class CompanyProfile:
    name: Optional[str] = None
    domain: Optional[str] = None
    industry: Optional[str] = None
    sub_industry: Optional[str] = None
    description: Optional[str] = None
    employee_count: Optional[str] = None
    employee_count_source: Optional[str] = None
    founded_year: Optional[int] = None
    headquarters: Optional[Location] = None
    funding: Optional[Funding] = None
    tech_stack: List[str] = field(default_factory=list)
    social: Optional[Social] = None
    revenue_signals: Optional[RevenueSignals] = None
    competitors: List[str] = field(default_factory=list)
    customers: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)


@dataclass
class PreviousCompany:
    name: str
    title: Optional[str] = None
    duration: Optional[str] = None


@dataclass
class PersonProfile:
    name: Optional[str] = None
    title: Optional[str] = None
    company: Optional[str] = None
    company_domain: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    location: Optional[Location] = None
    seniority: Optional[str] = None  # "C-Level" | "VP" | "Director" | "Manager" | "IC" | "Unknown"
    department: Optional[str] = None
    previous_companies: List[PreviousCompany] = field(default_factory=list)
    skills: List[str] = field(default_factory=list)
    bio: Optional[str] = None
    mutual_connections: List[str] = field(default_factory=list)


@dataclass
class RecentSignal:
    type: str
    date: str
    detail: str


@dataclass
class EngagementSignals:
    last_activity_date: Optional[str] = None
    engagement_score: Optional[int] = None
    recent_signals: List[RecentSignal] = field(default_factory=list)
    deal_stage: Optional[str] = None
    deal_value: Optional[str] = None
    next_steps: List[str] = field(default_factory=list)
    open_opportunities: Optional[int] = None
    owner: Optional[str] = None


@dataclass
class DataSource:
    url: str
    page_type: str
    extracted_at: str
    fields_extracted: List[str]


@dataclass
class EnrichmentSuggestion:
    field: str
    suggestion: str
    url_hint: Optional[str] = None


@dataclass
class StoredProfile:
    entity_type: str  # "company" | "person"
    primary_key: str
    display_name: str
    profile: Union[CompanyProfile, PersonProfile]
    engagement: Optional[EngagementSignals] = None
    sources: List[DataSource] = field(default_factory=list)
    gaps: List[str] = field(default_factory=list)
    enrichment_suggestions: List[EnrichmentSuggestion] = field(default_factory=list)
    completeness: int = 0
    last_updated: str = ""
    created_at: str = ""


# ============================================================================
# FIELD PRIORITY MAPS (from account-schema.ts)
# ============================================================================

COMPANY_FIELD_PRIORITIES: Dict[str, GapPriority] = {
    'name': GapPriority.CRITICAL,
    'domain': GapPriority.CRITICAL,
    'industry': GapPriority.CRITICAL,
    'employee_count': GapPriority.CRITICAL,
    'description': GapPriority.HIGH,
    'headquarters': GapPriority.HIGH,
    'funding.total_raised': GapPriority.HIGH,
    'funding.last_round': GapPriority.HIGH,
    'revenue_signals.estimated_arr': GapPriority.HIGH,
    'revenue_signals.pricing_model': GapPriority.HIGH,
    'tech_stack': GapPriority.HIGH,
    'competitors': GapPriority.MEDIUM,
    'social.linkedin_url': GapPriority.MEDIUM,
    'social.github_url': GapPriority.MEDIUM,
    'social.twitter_url': GapPriority.LOW,
    'founded_year': GapPriority.LOW,
    'customers': GapPriority.LOW,
    'tags': GapPriority.LOW,
}

PERSON_FIELD_PRIORITIES: Dict[str, GapPriority] = {
    'name': GapPriority.CRITICAL,
    'title': GapPriority.CRITICAL,
    'company': GapPriority.CRITICAL,
    'seniority': GapPriority.CRITICAL,
    'department': GapPriority.CRITICAL,
    'email': GapPriority.HIGH,
    'linkedin_url': GapPriority.HIGH,
    'location': GapPriority.HIGH,
    'phone': GapPriority.MEDIUM,
    'previous_companies': GapPriority.MEDIUM,
    'skills': GapPriority.LOW,
    'bio': GapPriority.LOW,
}

TOTAL_COMPANY_FIELDS = len(COMPANY_FIELD_PRIORITIES)
TOTAL_PERSON_FIELDS = len(PERSON_FIELD_PRIORITIES)


# ============================================================================
# PAGE CLASSIFIER
# ============================================================================

@dataclass
class ClassificationResult:
    page_type: str
    confidence: str  # "high", "medium", "low"
    entity_type: str  # "company", "person", "unknown"
    name: Optional[str] = None
    domain: Optional[str] = None


# URL patterns (from page-classifier.ts)
URL_RULES = [
    (r'linkedin\.com/company/([^/?#]+)', 'linkedin_company', 'company'),
    (r'linkedin\.com/in/([^/?#]+)', 'linkedin_person', 'person'),
    (r'\.my\.salesforce\.com/.*?/Account/', 'salesforce_account', 'company'),
    (r'\.my\.salesforce\.com/.*?/Contact/', 'salesforce_contact', 'person'),
    (r'\.my\.salesforce\.com/.*?/Opportunity/', 'salesforce_opportunity', 'company'),
    (r'app\.hubspot\.com/contacts/.*?/company/', 'hubspot_company', 'company'),
    (r'app\.hubspot\.com/contacts/.*?/contact/', 'hubspot_contact', 'person'),
    (r'app\.outreach\.io/.*?/prospects/', 'outreach_prospect', 'person'),
    (r'app\.commonroom\.io', 'common_room_profile', 'company'),
    (r'crunchbase\.com/organization/([^/?#]+)', 'crunchbase_org', 'company'),
    (r'g2\.com/products/([^/?#]+)', 'g2_product', 'company'),
    (r'github\.com/([^/?#]+)/?$', 'github_org', 'company'),
    (r'github\.com/([^/?#]+)/([^/?#]+)', 'github_repo', 'company'),
    (r'/(careers|jobs|openings|positions)', 'company_careers', 'company'),
    (r'/pricing', 'company_pricing', 'company'),
    (r'/(blog|news|press|articles)/', 'company_blog', 'company'),
    (r'greenhouse\.io/', 'job_posting', 'company'),
    (r'lever\.co/', 'job_posting', 'company'),
]

# Content signals for fallback classification
CONTENT_SIGNALS = {
    'followers on LinkedIn': ('linkedin_company', 'company'),
    'employees on LinkedIn': ('linkedin_company', 'company'),
    'Experience': ('linkedin_person', 'person'),
    'Account Owner': ('salesforce_account', 'company'),
    'Annual Revenue': ('salesforce_account', 'company'),
    'Total Funding': ('crunchbase_org', 'company'),
    'Founded Date': ('crunchbase_org', 'company'),
}


def extract_domain(url: str) -> Optional[str]:
    """Extract domain from URL."""
    try:
        # Simple domain extraction
        match = re.search(r'(?:https?://)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', url)
        if match:
            return match.group(1).lstrip('www.')
        return None
    except:
        return None


def looks_like_company_website(url: str, text: str) -> bool:
    """Check if content looks like a company website."""
    company_signals = ['About Us', 'Our Team', 'Contact Us', 'Products', 'Solutions', 'Customers']
    match_count = sum(1 for signal in company_signals if signal in text)
    return match_count >= 2


def classify_page(url: str, page_text: str) -> ClassificationResult:
    """Classify page type from URL and content."""
    # Try URL rules first
    for pattern, page_type, entity_type in URL_RULES:
        match = re.search(pattern, url)
        if match:
            name = None
            if match.groups():
                name = match.group(1).replace('-', ' ')
            return ClassificationResult(
                page_type=page_type,
                confidence='high',
                entity_type=entity_type,
                name=name,
                domain=extract_domain(url) if entity_type == 'company' else None,
            )

    # Try content signals
    for signal, (page_type, entity_type) in CONTENT_SIGNALS.items():
        if signal in page_text:
            return ClassificationResult(
                page_type=page_type,
                confidence='medium',
                entity_type=entity_type,
            )

    # Fallback: check if it looks like a company website
    if looks_like_company_website(url, page_text):
        return ClassificationResult(
            page_type='company_website',
            confidence='low',
            entity_type='company',
            domain=extract_domain(url),
        )

    return ClassificationResult(
        page_type='unknown',
        confidence='low',
        entity_type='unknown',
    )


# ============================================================================
# DATA EXTRACTORS (regex-based heuristics)
# ============================================================================

def extract_linkedin_company(text: str, url: str) -> CompanyProfile:
    """Extract company data from LinkedIn company page."""
    profile = CompanyProfile()

    # Name from URL or heading
    name_match = re.search(r'linkedin\.com/company/([^/?#]+)', url)
    if name_match:
        profile.name = name_match.group(1).replace('-', ' ').title()

    # Industry — try labeled field first, then common industry phrases on their own line
    industry_match = re.search(r'Industry\s*[:\-]\s*([^\n]+)', text)
    if not industry_match:
        # Look for known industry patterns on a line by themselves
        industry_match = re.search(
            r'(?:^|\n)\s*((?:Information |Computer )?(?:Technology|Software|Services|Healthcare|Financial|Manufacturing|Education|Media|Entertainment|Marketing|Security|Consulting|Analytics)[^\n]{0,40})\s*(?:\n|$)',
            text, re.IGNORECASE
        )
    if industry_match:
        profile.industry = industry_match.group(1).strip()

    # Employee count — look for range first ("201-500 employees"), then plain number
    emp_range_match = re.search(r'([\d,]+-[\d,]+)\s*(?:employees?|members?)', text, re.IGNORECASE)
    emp_plain_match = re.search(r'([\d,]+)\s*(?:employees?|members?)\s+(?:on\s+)?LinkedIn', text, re.IGNORECASE)
    if emp_range_match:
        profile.employee_count = emp_range_match.group(1).replace(',', '')
        profile.employee_count_source = 'linkedin'
    elif emp_plain_match:
        profile.employee_count = emp_plain_match.group(1).replace(',', '')
        profile.employee_count_source = 'linkedin'

    # Headquarters
    hq_match = re.search(r'Headquarters?\s*[:\-]\s*([^\n]+)', text)
    if hq_match:
        hq_text = hq_match.group(1).strip()
        profile.headquarters = parse_location(hq_text)

    # Founded year
    founded_match = re.search(r'Founded\s+(\d{4})', text)
    if founded_match:
        profile.founded_year = int(founded_match.group(1))

    # Description — stop at known field labels
    desc_match = re.search(r'About\s*[:\-]\s*([^\n]+)', text)
    if desc_match:
        profile.description = desc_match.group(1).strip()[:300]

    # Website / domain — try explicit field first, then bare domain pattern
    website_match = re.search(r'Website\s*[:\-]\s*(https?://[^\s\n]+|[a-z0-9.-]+\.[a-z]{2,})', text, re.IGNORECASE)
    if website_match:
        url_text = website_match.group(1).strip()
        if url_text.startswith('http'):
            domain = extract_domain(url_text)
        else:
            domain = url_text.lower().replace('www.', '')
        if domain:
            profile.domain = domain

    # Set LinkedIn URL from the page URL itself
    profile.social = Social(linkedin_url=url)

    return profile


def extract_linkedin_person(text: str, url: str) -> PersonProfile:
    """Extract person data from LinkedIn person page."""
    profile = PersonProfile()

    # LinkedIn URL from page URL itself
    if 'linkedin.com/in/' in url:
        profile.linkedin_url = url

    # Name from heading or title line
    name_match = re.search(r'(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*(?:\n|$)', text)
    if name_match:
        profile.name = name_match.group(1)

    # Current title and company
    title_match = re.search(r'([A-Z][^@\n]*?)\s+at\s+([A-Z][^\n]+)', text)
    if title_match:
        profile.title = title_match.group(1).strip()
        profile.company = title_match.group(2).strip()
    elif re.search(r'Experience', text):
        # Try to extract from experience section
        exp_match = re.search(r'Experience.*?([A-Z][^@\n]+?)\s+(?:at|·)\s+([A-Z][^\n]+)', text, re.DOTALL)
        if exp_match:
            profile.title = exp_match.group(1).strip()
            profile.company = exp_match.group(2).strip()

    # Email (usually shown after name)
    email_match = re.search(r'([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', text)
    if email_match:
        profile.email = email_match.group(1)

    # Location — try labeled field first, then known geo patterns (after name/title lines)
    location_match = re.search(r'(?:Location|Based in|Works in)\s*[:\-]\s*([^\n]+)', text)
    if not location_match:
        # Look for patterns like "San Francisco Bay Area" or "City, State" after the title line
        location_match = re.search(
            r'(?:^|\n)\s*('
            r'(?:Greater\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*'
            r'(?:\s+(?:Bay\s+)?Area|(?:\s+Metro(?:politan)?(?:\s+Area)?)?)'
            r'(?:,\s*[A-Z][A-Za-z\s]+)*'
            r')\s*(?:\n|$)',
            text
        )
    if location_match:
        loc_text = location_match.group(1).strip()
        # Don't use the name as location — skip if it matches the extracted name
        if profile.name and loc_text == profile.name:
            pass
        else:
            profile.location = parse_location(loc_text)

    # Department/Skills from text patterns
    if 'Engineering' in text or 'Developer' in profile.title if profile.title else False:
        profile.department = 'Engineering'
    elif 'Sales' in text:
        profile.department = 'Sales'
    elif 'Marketing' in text:
        profile.department = 'Marketing'

    # Seniority
    if profile.title:
        title_lower = profile.title.lower()
        if any(x in title_lower for x in ['ceo', 'cto', 'cfo', 'coo']):
            profile.seniority = 'C-Level'
        elif any(x in title_lower for x in ['vp ', 'vice president']):
            profile.seniority = 'VP'
        elif 'director' in title_lower:
            profile.seniority = 'Director'
        elif 'manager' in title_lower:
            profile.seniority = 'Manager'
        else:
            profile.seniority = 'IC'

    return profile


def extract_salesforce_account(text: str, url: str) -> CompanyProfile:
    """Extract company data from Salesforce account page."""
    profile = CompanyProfile()

    # Name
    name_match = re.search(r'Account Name\s*[:\-]\s*([^\n]+)', text)
    if name_match:
        profile.name = name_match.group(1).strip()

    # Industry
    industry_match = re.search(r'Industry\s*[:\-]\s*([^\n]+)', text)
    if industry_match:
        profile.industry = industry_match.group(1).strip()

    # Annual Revenue
    revenue_match = re.search(r'Annual Revenue\s*[:\-]\s*\$?([\d,.]+[MBK]?)', text)
    if revenue_match:
        profile.revenue_signals = RevenueSignals(
            estimated_arr=revenue_match.group(1).strip()
        )

    # Employee count
    emp_match = re.search(r'Employees?\s*[:\-]\s*([\d,]+)', text)
    if emp_match:
        profile.employee_count = emp_match.group(1).replace(',', '')
        profile.employee_count_source = 'salesforce'

    # Website / domain
    web_match = re.search(r'Website\s*[:\-]\s*(https?://[^\s\n]+|[a-z0-9.-]+\.[a-z]{2,})', text, re.IGNORECASE)
    if web_match:
        d = web_match.group(1).strip()
        profile.domain = d if not d.startswith('http') else extract_domain(d)

    # Headquarters from Billing Address or Mailing Address
    addr_match = re.search(r'(?:Billing|Mailing|Shipping)?\s*Address\s*[:\-]\s*([^\n]+)', text)
    if addr_match:
        profile.headquarters = parse_location(addr_match.group(1).strip())

    # Account Owner (store as tag for now)
    owner_match = re.search(r'Account Owner\s*[:\-]\s*([^\n]+)', text)
    if owner_match:
        profile.tags = [f"owner:{owner_match.group(1).strip()}"]

    return profile


def extract_salesforce_contact(text: str, url: str) -> PersonProfile:
    """Extract person data from Salesforce contact page."""
    profile = PersonProfile()

    # Name
    name_match = re.search(r'(?:First Name|Name)\s*[:\-]\s*([^\n]+)', text)
    if name_match:
        profile.name = name_match.group(1).strip()

    # Title
    title_match = re.search(r'Title\s*[:\-]\s*([^\n]+)', text)
    if title_match:
        profile.title = title_match.group(1).strip()

    # Company (Account)
    company_match = re.search(r'Account\s*[:\-]\s*([^\n]+)', text)
    if company_match:
        profile.company = company_match.group(1).strip()

    # Email
    email_match = re.search(r'Email\s*[:\-]\s*([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', text)
    if email_match:
        profile.email = email_match.group(1)

    # Phone
    phone_match = re.search(r'Phone\s*[:\-]\s*([\d\s\-\+\(\)]+)', text)
    if phone_match:
        profile.phone = phone_match.group(1).strip()

    return profile


def extract_crunchbase_org(text: str, url: str) -> CompanyProfile:
    """Extract company data from Crunchbase."""
    profile = CompanyProfile()

    # Name from URL
    name_match = re.search(r'crunchbase\.com/organization/([^/?#]+)', url)
    if name_match:
        profile.name = name_match.group(1).replace('-', ' ').title()

    # Headquarters
    hq_match = re.search(r'Headquarters\s*[:\-]\s*([^\n]+)', text)
    if hq_match:
        profile.headquarters = parse_location(hq_match.group(1).strip())

    # Founded Date
    founded_match = re.search(r'Founded Date\s*[:\-]\s*(\d{4})', text)
    if founded_match:
        profile.founded_year = int(founded_match.group(1))

    # Total Funding
    funding_match = re.search(r'Total Funding\s*[:\-]\s*\$?([\d.]+[MBK]?)', text)
    if funding_match:
        profile.funding = Funding(total_raised=funding_match.group(1).strip())

    # Last Round
    round_match = re.search(r'Last Funding\s*[:\-]\s*([^\n]+)', text)
    if round_match:
        round_text = round_match.group(1).strip()
        if profile.funding:
            profile.funding.last_round = round_text

    # Industry
    industry_match = re.search(r'Industry\s*[:\-]\s*([^\n]+)', text)
    if industry_match:
        profile.industry = industry_match.group(1).strip()

    return profile


def extract_company_website(text: str, url: str) -> CompanyProfile:
    """Extract company data from general company website."""
    profile = CompanyProfile()

    # Domain
    profile.domain = extract_domain(url)

    # Name from title or heading
    name_match = re.search(r'<title>([^-|]+)', text)
    if name_match:
        profile.name = name_match.group(1).strip()

    # Description from About section
    about_match = re.search(r'(?:About Us|About|Mission)\s*[:\-]\s*([^\n]+(?:\n[^\n]+){0,2})', text, re.IGNORECASE)
    if about_match:
        profile.description = about_match.group(1).strip()[:300]

    # Look for pricing model hints
    if 'pricing' in text.lower():
        if 'free' in text.lower():
            profile.revenue_signals = RevenueSignals(has_free_tier=True)
        if 'enterprise' in text.lower():
            if not profile.revenue_signals:
                profile.revenue_signals = RevenueSignals()
            profile.revenue_signals.pricing_model = 'enterprise'

    return profile


def extract_common_room(text: str, url: str) -> CompanyProfile:
    """Extract company data from Common Room organization profile."""
    profile = CompanyProfile()

    # Name from title or heading
    name_match = re.search(r'^([A-Z][A-Za-z0-9\s&.,-]+?)(?:\s*[•·|]|\n)', text)
    if name_match:
        profile.name = name_match.group(1).strip()

    # Industry
    industry_match = re.search(r'Industry\s*[:\-]\s*([^\n]+)', text)
    if industry_match:
        profile.industry = industry_match.group(1).strip()

    # Domain/website
    domain_match = re.search(r'Website\s*[:\-]\s*([^\s\n]+)', text, re.IGNORECASE)
    if domain_match:
        d = domain_match.group(1).strip()
        profile.domain = d if not d.startswith('http') else extract_domain(d)

    # Employee count
    emp_match = re.search(r'([\d,]+(?:-[\d,]+)?)\s*(?:employees?|people)', text, re.IGNORECASE)
    if emp_match:
        profile.employee_count = emp_match.group(1).replace(',', '')

    # Description
    desc_match = re.search(r'(?:About|Description)\s*[:\-]\s*([^\n]+)', text, re.IGNORECASE)
    if desc_match:
        profile.description = desc_match.group(1).strip()[:300]

    return profile


def parse_location(text: str) -> Optional[Location]:
    """Parse location from text like 'San Francisco, CA, United States'."""
    if not text:
        return None

    parts = [p.strip() for p in text.split(',')]
    location = Location()

    if len(parts) >= 3:
        location.city = parts[0]
        location.state = parts[1]
        location.country = parts[2]
    elif len(parts) == 2:
        location.city = parts[0]
        location.state = parts[1]
    elif len(parts) == 1:
        location.city = parts[0]

    return location


# ============================================================================
# PROFILE COMPLETENESS & GAP ANALYSIS
# ============================================================================

def get_filled_fields(profile: Union[CompanyProfile, PersonProfile]) -> List[str]:
    """Get list of filled fields in profile."""
    filled = []
    profile_dict = dataclass_to_dict(profile)

    for field_path in (COMPANY_FIELD_PRIORITIES if isinstance(profile, CompanyProfile)
                      else PERSON_FIELD_PRIORITIES):
        value = get_nested_value(profile_dict, field_path)
        if is_filled(value):
            filled.append(field_path)

    return filled


def get_nested_value(obj: Dict, path: str) -> Any:
    """Get value from nested dict using dot notation."""
    parts = path.split('.')
    current = obj
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def is_filled(value: Any) -> bool:
    """Check if a value is considered 'filled'."""
    if value is None:
        return False
    if isinstance(value, str) and not value.strip():
        return False
    if isinstance(value, list) and len(value) == 0:
        return False
    if isinstance(value, dict) and all(v is None for v in value.values()):
        return False
    return True


def calculate_completeness(entity_type: str, filled_fields: List[str]) -> int:
    """Calculate profile completeness percentage."""
    total = TOTAL_COMPANY_FIELDS if entity_type == 'company' else TOTAL_PERSON_FIELDS
    return round((len(filled_fields) / total) * 100)


def analyze_gaps(profile: Union[CompanyProfile, PersonProfile],
                 entity_type: str) -> Tuple[List[str], List[EnrichmentSuggestion]]:
    """Analyze gaps and generate enrichment suggestions."""
    priorities = COMPANY_FIELD_PRIORITIES if entity_type == 'company' else PERSON_FIELD_PRIORITIES
    filled_fields = set(get_filled_fields(profile))

    gaps = []
    suggestions = []

    # Get profile name for suggestions
    profile_name = getattr(profile, 'name', None) or getattr(profile, 'display_name', 'Profile')
    profile_domain = getattr(profile, 'domain', None)

    for field, priority in priorities.items():
        if field not in filled_fields:
            gaps.append(f"{field}:{priority.value}")

            # Generate enrichment suggestion
            suggestion = generate_enrichment_suggestion(
                field, entity_type, profile_name, profile_domain
            )
            if suggestion:
                suggestions.append(suggestion)

    return gaps, suggestions


def generate_enrichment_suggestion(field: str, entity_type: str,
                                   name: str, domain: Optional[str]) -> Optional[EnrichmentSuggestion]:
    """Generate enrichment suggestion for a missing field."""
    suggestions_map = {
        'funding': lambda: EnrichmentSuggestion(
            field='funding',
            suggestion=f'Check Crunchbase for {name}',
            url_hint=f'https://crunchbase.com/organization/{name.lower().replace(" ", "-")}'
        ),
        'tech_stack': lambda: EnrichmentSuggestion(
            field='tech_stack',
            suggestion=f'Check BuiltWith or Wappalyzer for {domain}' if domain else 'Check BuiltWith',
            url_hint=f'https://builtwith.com/{domain}' if domain else None
        ),
        'employee_count': lambda: EnrichmentSuggestion(
            field='employee_count',
            suggestion=f'Check LinkedIn company page for {name}',
            url_hint=f'https://linkedin.com/company/{name.lower().replace(" ", "-")}'
        ),
        'revenue_signals': lambda: EnrichmentSuggestion(
            field='revenue_signals',
            suggestion='Check pricing page',
            url_hint=f'https://{domain}/pricing' if domain else None
        ),
        'competitors': lambda: EnrichmentSuggestion(
            field='competitors',
            suggestion=f'Search G2 for {name} alternatives',
            url_hint=f'https://g2.com/search?query={name.replace(" ", "+")}'
        ),
        'email': lambda: EnrichmentSuggestion(
            field='email',
            suggestion='Look up on Hunter.io or check company contact page'
        ),
        'linkedin_url': lambda: EnrichmentSuggestion(
            field='linkedin_url',
            suggestion=f'Search LinkedIn for {name}',
            url_hint=f'https://linkedin.com/search/results/people/?keywords={name.replace(" ", "+")}'
        ),
        'headquarters': lambda: EnrichmentSuggestion(
            field='headquarters',
            suggestion=f'LinkedIn company page shows HQ location for {name}'
        ),
        'social.linkedin_url': lambda: EnrichmentSuggestion(
            field='social.linkedin_url',
            suggestion=f'Search LinkedIn for {name} company page',
            url_hint=f'https://linkedin.com/search/results/companies/?keywords={name.replace(" ", "+")}'
        ),
    }

    generator = suggestions_map.get(field)
    return generator() if generator else None


# ============================================================================
# PROFILE STORAGE & MERGE
# ============================================================================

def dataclass_to_dict(obj: Any) -> Dict:
    """Convert dataclass to dict, filtering out None values."""
    if hasattr(obj, '__dataclass_fields__'):
        result = {}
        for field_name, field in obj.__dataclass_fields__.items():
            value = getattr(obj, field_name)
            if value is not None:
                if hasattr(value, '__dataclass_fields__'):
                    result[field_name] = dataclass_to_dict(value)
                elif isinstance(value, list) and value and hasattr(value[0], '__dataclass_fields__'):
                    result[field_name] = [dataclass_to_dict(item) for item in value]
                else:
                    result[field_name] = value
        return result
    return obj


def dict_to_dataclass(data: Dict, cls: type) -> Any:
    """Convert dict to dataclass."""
    if not isinstance(data, dict):
        return data

    kwargs = {}
    for field_name, field in cls.__dataclass_fields__.items():
        if field_name in data:
            value = data[field_name]
            field_type = field.type

            # Handle Optional types
            if hasattr(field_type, '__origin__') and field_type.__origin__ is Union:
                field_type = field_type.__args__[0]

            if hasattr(field_type, '__dataclass_fields__'):
                kwargs[field_name] = dict_to_dataclass(value, field_type) if isinstance(value, dict) else value
            elif isinstance(value, list) and field_type.__origin__ is list:
                # Try to get item type
                item_type = getattr(field_type, '__args__', [dict])[0]
                if hasattr(item_type, '__dataclass_fields__'):
                    kwargs[field_name] = [dict_to_dataclass(item, item_type) for item in value]
                else:
                    kwargs[field_name] = value
            else:
                kwargs[field_name] = value

    return cls(**kwargs)


def load_existing_profile(entity_type: str, primary_key: str,
                         output_dir: str) -> Optional[StoredProfile]:
    """Load existing profile from disk."""
    if entity_type == 'company':
        subdir = 'companies'
    else:
        subdir = 'people'

    filename = re.sub(r'[^a-z0-9.-]', '-', primary_key) + '.json'
    path = os.path.join(output_dir, subdir, filename)

    if os.path.exists(path):
        with open(path, 'r') as f:
            data = json.load(f)
            return data  # Return as dict for now

    return None


def merge_profiles(existing: Dict, new_profile: Union[CompanyProfile, PersonProfile],
                   source: DataSource) -> Dict:
    """Merge new extracted data into existing profile."""
    new_data = dataclass_to_dict(new_profile)

    if 'profile' not in existing:
        existing['profile'] = {}

    for key, value in new_data.items():
        if value is None:
            continue

        existing_value = existing['profile'].get(key)

        if existing_value is None:
            # Fill empty field
            existing['profile'][key] = value
        elif isinstance(existing_value, list) and isinstance(value, list):
            # Merge and deduplicate arrays
            merged = list(set(existing_value + value))
            existing['profile'][key] = merged
        elif isinstance(existing_value, dict) and isinstance(value, dict):
            # Deep merge objects
            existing['profile'][key] = {**existing_value, **value}
        # For scalar conflicts: keep existing

    # Update source and timestamp
    if 'sources' not in existing:
        existing['sources'] = []
    existing['sources'].append(dataclass_to_dict(source) if hasattr(source, '__dataclass_fields__')
                              else source)
    existing['last_updated'] = datetime.utcnow().isoformat() + 'Z'

    return existing


def save_profile(profile: StoredProfile, output_dir: str) -> str:
    """Save profile to disk and return file path."""
    if profile.entity_type == 'company':
        subdir = 'companies'
    else:
        subdir = 'people'

    dir_path = os.path.join(output_dir, subdir)
    os.makedirs(dir_path, exist_ok=True)

    filename = re.sub(r'[^a-z0-9.-]', '-', profile.primary_key) + '.json'
    file_path = os.path.join(dir_path, filename)

    # Convert to JSON-serializable format
    profile_dict = {
        'entity_type': profile.entity_type,
        'primary_key': profile.primary_key,
        'display_name': profile.display_name,
        'profile': dataclass_to_dict(profile.profile),
        'engagement': dataclass_to_dict(profile.engagement) if profile.engagement else None,
        'sources': [dataclass_to_dict(s) for s in profile.sources],
        'gaps': profile.gaps,
        'enrichment_suggestions': [dataclass_to_dict(s) for s in profile.enrichment_suggestions],
        'completeness': profile.completeness,
        'last_updated': profile.last_updated,
        'created_at': profile.created_at,
    }

    with open(file_path, 'w') as f:
        json.dump(profile_dict, f, indent=2)

    # Update index
    update_index(output_dir, profile)

    return file_path


def save_profile_dict(profile_dict: Dict, output_dir: str) -> str:
    """Save a raw profile dict (already merged) to disk."""
    entity_type = profile_dict.get('entity_type', 'company')
    primary_key = profile_dict.get('primary_key', 'unknown')
    subdir = 'companies' if entity_type == 'company' else 'people'
    dir_path = os.path.join(output_dir, subdir)
    os.makedirs(dir_path, exist_ok=True)
    filename = re.sub(r'[^a-z0-9.-]', '-', primary_key) + '.json'
    file_path = os.path.join(dir_path, filename)
    with open(file_path, 'w') as f:
        json.dump(profile_dict, f, indent=2, default=str)
    return file_path


def update_index(output_dir: str, profile: StoredProfile):
    """Update the index.json file."""
    index_path = os.path.join(output_dir, 'index.json')

    if os.path.exists(index_path):
        with open(index_path, 'r') as f:
            index = json.load(f)
    else:
        index = {'companies': {}, 'people': {}, 'aliases': {}}

    if profile.entity_type == 'company':
        index['companies'][profile.primary_key] = profile.primary_key.replace(' ', '-') + '.json'
    else:
        index['people'][profile.primary_key] = profile.primary_key.replace(' ', '-') + '.json'

    # Add display name as alias
    if profile.display_name:
        index['aliases'][profile.display_name.lower()] = profile.primary_key

    os.makedirs(output_dir, exist_ok=True)
    with open(index_path, 'w') as f:
        json.dump(index, f, indent=2)


# ============================================================================
# MAIN SCANNING FUNCTION
# ============================================================================

def scan_page(url: str, title: str, page_text: str,
              output_dir: Optional[str] = None) -> Dict[str, Any]:
    """
    Main entry point: scan a page and return full StoredProfile.

    Args:
        url: Page URL
        title: Page title
        page_text: Raw page text
        output_dir: Optional directory to save profile (default: ~/.chrome-inspector/profiles)

    Returns:
        Dictionary with profile, gaps, suggestions, and file path
    """
    if output_dir is None:
        output_dir = os.path.expanduser('~/.chrome-inspector/profiles')

    # Step 1: Classify page
    classification = classify_page(url, page_text)

    # Step 2: Extract structured data based on page type
    if classification.page_type == 'linkedin_company':
        profile = extract_linkedin_company(page_text, url)
        entity_type = 'company'
    elif classification.page_type == 'linkedin_person':
        profile = extract_linkedin_person(page_text, url)
        entity_type = 'person'
    elif classification.page_type == 'salesforce_account':
        profile = extract_salesforce_account(page_text, url)
        entity_type = 'company'
    elif classification.page_type == 'salesforce_contact':
        profile = extract_salesforce_contact(page_text, url)
        entity_type = 'person'
    elif classification.page_type == 'crunchbase_org':
        profile = extract_crunchbase_org(page_text, url)
        entity_type = 'company'
    elif classification.page_type == 'company_website':
        profile = extract_company_website(page_text, url)
        entity_type = 'company'
    elif classification.page_type == 'common_room_profile':
        profile = extract_common_room(page_text, url)
        entity_type = 'company'
    else:
        # Unknown page type - try company extraction by default
        profile = CompanyProfile() if classification.entity_type == 'company' else PersonProfile()
        entity_type = classification.entity_type if classification.entity_type != 'unknown' else 'company'

    # Set basic fields if not set
    if entity_type == 'company':
        if not profile.name:
            profile.name = title or 'Unknown Company'
        if not profile.domain:
            profile.domain = classification.domain
    else:
        if not profile.name:
            profile.name = title or 'Unknown Person'

    # Step 3: Calculate completeness
    filled_fields = get_filled_fields(profile)
    completeness = calculate_completeness(entity_type, filled_fields)

    # Step 4: Analyze gaps
    gaps, enrichment_suggestions = analyze_gaps(profile, entity_type)

    # Step 5: Create DataSource entry
    source = DataSource(
        url=url,
        page_type=classification.page_type,
        extracted_at=datetime.utcnow().isoformat() + 'Z',
        fields_extracted=filled_fields,
    )

    # Step 6: Create StoredProfile
    # Primary key: for companies use domain (not the host of the page URL);
    # for people use LinkedIn slug if available, else "name--company"
    if entity_type == 'company':
        primary_key = profile.domain or profile.name.lower().replace(' ', '-') if profile.name else 'unknown'
    else:
        li_slug_match = re.search(r'linkedin\.com/in/([^/?#]+)', url)
        if li_slug_match:
            primary_key = li_slug_match.group(1)
            if not getattr(profile, 'linkedin_url', None):
                profile.linkedin_url = url
        elif profile.name and getattr(profile, 'company', None):
            primary_key = f"{profile.name.lower().replace(' ', '-')}--{profile.company.lower().replace(' ', '-')}"
        else:
            primary_key = profile.name.lower().replace(' ', '-') if profile.name else 'unknown'
    display_name = profile.name or 'Unknown'

    now = datetime.utcnow().isoformat() + 'Z'

    # Step 6b: Check for existing profile and merge if found
    existing = load_existing_profile(entity_type, primary_key, output_dir)
    if existing:
        merged = merge_profiles(existing, profile, source)
        # Recalculate completeness and gaps after merge
        merged_profile_obj = merged.get('profile', {})
        # Count filled fields from the merged dict
        priorities = COMPANY_FIELD_PRIORITIES if entity_type == 'company' else PERSON_FIELD_PRIORITIES
        merged_filled = []
        for fp in priorities:
            val = get_nested_value(merged_profile_obj, fp)
            if is_filled(val):
                merged_filled.append(fp)
        completeness = calculate_completeness(entity_type, merged_filled)
        # Recalculate gaps
        gaps = []
        enrichment_suggestions = []
        for fp, prio in priorities.items():
            if fp not in merged_filled:
                gaps.append(f"{fp}:{prio.value}")
        merged['completeness'] = completeness
        merged['gaps'] = gaps
        merged['last_updated'] = now

        stored_profile = StoredProfile(
            entity_type=entity_type,
            primary_key=primary_key,
            display_name=display_name,
            profile=profile,  # for return value
            sources=merged.get('sources', []),
            gaps=gaps,
            enrichment_suggestions=enrichment_suggestions,
            completeness=completeness,
            last_updated=now,
            created_at=merged.get('created_at', now),
        )
        # Write the merged dict directly (it has the merged profile data)
        merged['enrichment_suggestions'] = [dataclass_to_dict(s) for s in enrichment_suggestions] if enrichment_suggestions else []
        file_path = save_profile_dict(merged, output_dir)
    else:
        stored_profile = StoredProfile(
            entity_type=entity_type,
            primary_key=primary_key,
            display_name=display_name,
            profile=profile,
            sources=[source],
            gaps=gaps,
            enrichment_suggestions=enrichment_suggestions,
            completeness=completeness,
            last_updated=now,
            created_at=now,
        )
        # Step 7: Save to disk
        file_path = save_profile(stored_profile, output_dir)

    # Step 8: Return result summary
    return {
        'success': True,
        'entity_type': entity_type,
        'primary_key': primary_key,
        'display_name': display_name,
        'page_type': classification.page_type,
        'confidence': classification.confidence,
        'completeness': completeness,
        'fields_extracted': len(filled_fields),
        'gaps_count': len(gaps),
        'gaps': gaps[:10],  # Top 10 gaps
        'enrichment_suggestions': [dataclass_to_dict(s) for s in enrichment_suggestions[:5]],
        'file_path': file_path,
        'profile': dataclass_to_dict(profile),
    }


# ============================================================================
# CLI
# ============================================================================

def main():
    """Command-line interface."""
    parser = argparse.ArgumentParser(
        description='Scan a web page and extract company/person profile data.'
    )
    parser.add_argument('--url', required=True, help='Page URL')
    parser.add_argument('--title', required=True, help='Page title')
    parser.add_argument('--text-file', help='File containing page text')
    parser.add_argument('--text', help='Inline page text (alternative to --text-file)')
    parser.add_argument('--output-dir',
                       default=os.path.expanduser('~/.chrome-inspector/profiles'),
                       help='Output directory for profiles')

    args = parser.parse_args()

    # Read page text
    if args.text:
        page_text = args.text
    elif args.text_file:
        with open(args.text_file, 'r') as f:
            page_text = f.read()
    else:
        parser.error('Either --text or --text-file is required')

    # Scan page
    result = scan_page(args.url, args.title, page_text, args.output_dir)

    # Print results
    print(json.dumps(result, indent=2))

    if result['success']:
        print(f"\nProfile saved to: {result['file_path']}")
        print(f"Completeness: {result['completeness']}%")
        print(f"Fields extracted: {result['fields_extracted']}")


if __name__ == '__main__':
    main()
