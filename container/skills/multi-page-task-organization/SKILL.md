---
name: multi-page-task-organization
description: |
  Comprehensive task organization pattern for multi-page web applications. Use when:
  (1) planning implementation for system with 5+ interconnected pages, (2) need to
  organize features with complex dependencies (auth → core features → workflows),
  (3) team needs production-ready implementation docs with API specs, validation,
  and testing, (4) system has role-based access control with multiple user personas,
  (5) need clear phasing strategy for parallel development. Creates task index with
  status tracking and individual task files with complete backend/frontend/integration
  specifications.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# Multi-Page System Task Organization Pattern

## Problem

Planning implementation for a complex multi-page web application (5+ pages) with:
- Multiple user roles with different workflows
- Complex dependencies between features (e.g., authentication required before accessing any feature)
- Team needs clear, production-ready documentation
- Need to track status across multiple interconnected tasks
- Parallel development by multiple developers

Without proper organization, teams face:
- Unclear implementation order leading to blocked work
- Missing API specifications causing frontend/backend misalignment
- Inconsistent documentation quality across features
- Difficulty tracking progress and dependencies
- Developers uncertain about testing requirements

## Context / Trigger Conditions

**Use this pattern when:**

1. **Project Characteristics:**
   - 5+ interconnected pages/features to implement
   - Multiple user roles (e.g., Admin, Manager, User) with different permissions
   - Full-stack development (backend API + frontend UI)
   - Need for comprehensive testing (unit, integration, E2E)

2. **Team Needs:**
   - Multiple developers working in parallel
   - Need for clear API contracts between frontend and backend
   - Production-ready documentation (not just wireframes)
   - Status tracking for project management

3. **Complexity Indicators:**
   - Features depend on each other (authentication → core features → advanced workflows)
   - Role-based authorization required
   - Shared infrastructure needed (layouts, auth guards, constants)
   - Multi-phase implementation timeline (6+ weeks)

## Solution

### Step 1: Create Task Folder Structure

```
docs/tasks/
├── README.md                    # Task index with status tracking
├── 00-infrastructure.md         # Foundation (must be first)
├── 01-feature-name.md           # Individual task files
├── 02-feature-name.md
└── ...
```

### Step 2: Create Task Index (README.md)

**Essential Sections:**

1. **Status Overview Table:**
```markdown
| ID | Task | Priority | Status | Assignee | Notes |
|----|------|----------|--------|----------|-------|
| 00 | Infrastructure | CRITICAL | 🔴 Not Started | - | Auth, layout, constants |
| 01 | Login Page | CRITICAL | 🔴 Not Started | - | Gateway to system |
```

**Status Legend:** 🔴 Not Started | 🟡 In Progress | 🟢 Completed | ⚪ Blocked

2. **Implementation Order (Phased Approach):**

**Phase 1: Foundation** (Week 1)
- Infrastructure: Auth, guards, layouts, shared components
- Login: Entry point for all users

**Phase 2: Primary Users** (Weeks 2-3)
- Features for most common user role
- Core business workflows

**Phase 3: Secondary Features** (Weeks 4-5)
- Admin/management features
- Advanced workflows

**Phase 4: Completion** (Week 6)
- Edge cases and polish
- Cross-feature integration

3. **API Endpoints Summary:**
```markdown
### Authentication
- POST /api/auth/login - Login
- GET /api/auth/me - Current user

### Feature A
- GET /api/feature-a - List items
- POST /api/feature-a - Create item
...
```

4. **Testing Requirements:**
- Minimum coverage: 80%
- Test types: Unit, integration, E2E
- Critical flows to test

5. **Verification Checklist:**
- Backend verification steps
- Frontend verification steps
- Integration verification steps

### Step 3: Create Individual Task Files

**Each task file follows this comprehensive template:**

```markdown
# Task XX: [Feature Name]

**Priority:** CRITICAL | HIGH | MEDIUM | LOW
**Effort:** X days
**Dependencies:** Task YY, Task ZZ
**User Roles:** [Roles that use this feature]

---

## Overview

[1-2 paragraphs explaining what this task accomplishes and why it matters]

## User Story

**As a** [user role],
**I want** [feature],
**So that** [business value].

---

## Backend Implementation

### 1. API Endpoints

**Endpoint 1: [HTTP METHOD] /api/resource**

**Request:**
\`\`\`typescript
{
  field: string;
  // Full request body spec
}
\`\`\`

**Response:**
\`\`\`typescript
{
  id: number;
  // Full response body spec
}
\`\`\`

**Business Logic:**
1. Step 1
2. Step 2
...

**Authorization:**
- Roles allowed: [List roles]
- Scope rules: [e.g., user can only access their own data]

### 2. Validation Schema

**Location:** \`packages/shared-schemas/src/feature.schema.ts\`

\`\`\`typescript
import { z } from 'zod';

export const featureSchema = z.object({
  field: z.string().min(1, 'Hebrew error message here'),
});

export type FeatureDto = z.infer<typeof featureSchema>;
\`\`\`

### 3. Database Operations

[If needed, specify Drizzle ORM queries or complex joins]

---

## Frontend Implementation

### 1. Page Component

**Location:** \`apps/web/src/pages/FeaturePage.tsx\`

**Route:** \`/feature\`

**Layout:**
[ASCII diagram or description of page layout]

**Implementation:**
\`\`\`typescript
// Key implementation details or patterns
\`\`\`

### 2. State Management

- **TanStack Query:** API data fetching and caching
- **Local State:** Form state, UI toggles
- **Context:** [If using Context API]

### 3. API Integration

**Location:** \`apps/web/src/api/feature.ts\`

\`\`\`typescript
export const useFeatureQuery = () => {
  return useQuery({
    queryKey: ['feature'],
    queryFn: fetchFeature,
  });
};
\`\`\`

### 4. Hebrew Constants

Add to \`apps/web/src/constants/hebrew.ts\`:

\`\`\`typescript
export const HEBREW = {
  // Feature-specific labels
  FEATURE_TITLE: 'כותרת בעברית',
  FEATURE_ACTION: 'פעולה',
  ...
};
\`\`\`

### 5. RTL Considerations

- [Specific RTL layout considerations]
- Icon positioning
- Form alignment
- Table column order

---

## Integration Tasks

1. **Connect Frontend to Backend:**
   - Verify API endpoint returns correct data
   - Test error handling
   - Verify validation messages display correctly

2. **End-to-End Flow:**
   - User navigates to page → data loads → user performs action → success

---

## Testing Requirements

### Backend Tests

**Unit Tests:**
- Service method X
- Validation schema Y

**Integration Tests:**
- POST /api/feature - Success case
- POST /api/feature - Validation error
- POST /api/feature - Authorization error

### Frontend Tests

**Component Tests:**
- FeaturePage renders correctly
- Form validation works
- Error states display

### E2E Tests

**Critical Flow:**
1. Navigate to feature page
2. Perform action
3. Verify result

**Coverage Target:** 80%+

---

## Acceptance Criteria

### Backend
- [ ] All endpoints return correct responses
- [ ] Validation works with Hebrew error messages
- [ ] Authorization enforces role rules
- [ ] Database queries optimized
- [ ] Unit tests passing (80%+)
- [ ] Integration tests passing

### Frontend
- [ ] All text in Hebrew
- [ ] RTL layout correct
- [ ] Forms validate properly
- [ ] Data loads and displays
- [ ] Responsive on all devices
- [ ] Loading states shown
- [ ] Error handling graceful
- [ ] Component tests passing (80%+)

### Integration
- [ ] Frontend connects to backend
- [ ] Data flows correctly
- [ ] E2E tests passing

---

## Implementation Notes

### Security Considerations
[Security best practices for this feature]

### Performance Considerations
[Performance optimizations needed]

### UX Considerations
[User experience details]

### Common Gotchas
[Known issues or pitfalls to avoid]

---

## Related Documentation

- **Markup Spec:** \`docs/markups/XX-feature.md\`
- **Database Schema:** \`apps/api/src/database/schema/feature.schema.ts\`
- **API Docs:** [Link if external]

---

**Status:** 🔴 Not Started
**Depends On:** [Task dependencies]
**Last Updated:** YYYY-MM-DD
```

### Step 4: Prioritize by Dependencies

**Dependency-Based Ordering:**

1. **Foundation First:**
   - Infrastructure task (00) must be completed before anything else
   - Authentication, layouts, constants, shared components
   - No other work can proceed without this

2. **Primary User Workflows:**
   - Start with most common user role
   - Focus on core business value
   - Features that generate immediate ROI

3. **Secondary Features:**
   - Admin/management tools
   - Advanced workflows
   - Nice-to-have features

4. **Integration & Polish:**
   - Cross-feature integration
   - Edge cases
   - Performance optimization

**Visual Dependency Example:**

```
00-infrastructure (FOUNDATION)
       ↓
   01-login
       ↓
   ├─→ 02-dashboard
   ├─→ 03-core-feature-1
   └─→ 04-core-feature-2
       ↓
   ├─→ 05-admin-feature
   └─→ 06-advanced-workflow
```

### Step 5: Track Status and Update Regularly

1. **Update README.md status table** after completing each task
2. **Mark blockers** if dependencies aren't met
3. **Add notes** for important discoveries or changes
4. **Review weekly** with team to adjust priorities

## Verification

### After Creating Task Organization

- [ ] Task index (README.md) exists with status table
- [ ] Implementation order is clear and phased
- [ ] All API endpoints documented in README
- [ ] Testing requirements defined
- [ ] Each task file follows the comprehensive template
- [ ] Dependencies are clearly documented
- [ ] Acceptance criteria are specific and measurable

### After Completing a Task

- [ ] All acceptance criteria checked off
- [ ] Tests passing (80%+ coverage)
- [ ] Status updated in README.md
- [ ] Dependent tasks unblocked

## Example

**Scenario:** Building a soldier site management system with 8 pages and 4 user roles.

**Task Organization Created:**

```
docs/tasks/
├── README.md (13KB)
│   - Status table for all 9 tasks
│   - 4-phase implementation order
│   - 30+ API endpoints documented
│   - Testing requirements (80% coverage)
│   - Verification checklists
│
├── 00-infrastructure.md (26KB)
│   - Auth module (JWT + guards)
│   - Master layout (header + sidebar)
│   - Hebrew constants file (100+ labels)
│   - RTL configuration
│   - Shared components
│
├── 01-login.md (21KB)
│   - Login page with ID-only auth
│   - Role-based redirect
│   - Session persistence
│
├── 02-branch-commander-dashboard.md (19KB)
│   - Dashboard with stats
│   - Quota utilization table
│
├── 03-admissions-table.md (21KB)
│   - Data table with search/filter
│   - Excel export
│
└── ... (5 more task files)
```

**Result:**
- 200KB of production-ready documentation
- Clear implementation path across 6 weeks
- All developers know exactly what to build
- Status tracking enabled for project management
- 80%+ test coverage enforced

## Notes

### When to Use This Pattern

**✅ Good fit:**
- Multi-page web applications (5+ pages)
- Team of 2+ developers
- 6+ week implementation timeline
- Role-based access control
- Full-stack projects (backend + frontend)

**❌ Not needed:**
- Single-page applications
- Simple CRUD apps (1-3 pages)
- Solo developer with clear mental model
- Projects < 2 weeks
- Prototypes or MVPs

### Documentation Maintenance

- **Living Documentation:** Update task files when implementation differs from plan
- **Version Control:** Commit task files to git along with code
- **Review Process:** Have another developer review task files before implementation
- **Consistency:** Use the same template for all tasks

### Integration with Agile Workflows

- **Epics:** Each phase = Epic
- **Stories:** Each task file = User Story (or multiple stories)
- **Acceptance Criteria:** Copy directly from task files to ticket system
- **Estimation:** Effort estimates in task files inform sprint planning

### Common Pitfalls to Avoid

1. **Too Much Upfront Planning:** Don't document every detail before starting. Create high-level task files, then elaborate as you reach each task.

2. **Inconsistent Templates:** Stick to the template. Inconsistency makes tasks harder to compare and review.

3. **Outdated Status:** Update README.md status table religiously. Stale status information undermines trust.

4. **Missing Dependencies:** Always document task dependencies. Parallel work is only possible with clear dependency mapping.

5. **Vague Acceptance Criteria:** Make criteria specific and measurable. "Works correctly" is not acceptable; "All unit tests passing (80%+ coverage)" is.

## References

- [IT Project Documentation Best Practices 2026](https://devcom.com/blog/it-project-documentation-13-basic-documents-devcom/)
- [Project Documentation: 25 Essential Documents](https://www.projectmanager.com/blog/great-project-documentation)
- [Software Documentation Best Practices](https://www.atlassian.com/blog/loom/software-documentation-best-practices)
- [Implementation Plan: 6 Steps to Create One](https://asana.com/resources/implementation-plan)
- [Technical Documentation Best Practices](https://www.altexsoft.com/blog/technical-documentation-in-software-development-types-best-practices-and-tools/)
