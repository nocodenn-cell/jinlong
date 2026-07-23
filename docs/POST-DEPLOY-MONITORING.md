# 📊 Post-Deployment Monitoring Template

**Purpose**: Track system health and user experience for 24-48h after go-live.

**Update Frequency**: Every 30min (first 2h), then hourly (next 6h), then 4x daily (first week)

---

## Quick Health Check (30min intervals - first 2h)

### 1. Availability & Errors
```
Time: ___________
Sentry Error Count (last 30min): _____ (Target: 0-2)
Vercel Response Status: _____ (Target: 200)
API Health Check (/api/health): ✅ / ❌
```

### 2. Performance
```
Vercel LCP (Largest Contentful Paint): _____ms (Target: <3000ms)
Vercel FID (First Input Delay): _____ms (Target: <100ms)
P95 Page Load Time: _____ms (Target: <3000ms)
```

### 3. Sync & Data
```
Gerente sees recent sales: ✅ / ❌ (Should see within 1-2min)
Last successful sync timestamp: _____
Sync lag observed: _____s (Target: <120s)
```

### 4. User Operations
```
Operators able to login: ✅ / ❌
Product search working: ✅ / ❌
Sales finalizing: ✅ / ❌
Cash register opening: ✅ / ❌
```

### Sample Log Entry
```
2026-07-23 10:05 | Errors: 0 | LCP: 2100ms | Sync: ✅ (45s lag) | Users: ✅
2026-07-23 10:35 | Errors: 1 (login timeout) | LCP: 2300ms | Sync: ✅ (52s lag) | Users: ✅ ⚠
2026-07-23 11:05 | Errors: 0 | LCP: 1900ms | Sync: ✅ (38s lag) | Users: ✅
```

---

## Hourly Review (4-8 hours post-deploy)

### Error Analysis
```
Sentry Issues Last Hour: _____
Top 3 Exception Types:
  1. _________________
  2. _________________
  3. _________________
Unplanned errors? ✅ / ❌
Source maps loading correctly? ✅ / ❌
```

### Performance Trends
```
Avg Page Load (last hour): _____ms
Max Page Load: _____ms (at __:__)
95th Percentile: _____ms
Trend: ↑ Increasing / ↓ Decreasing / → Stable
```

### Data Integrity
```
Total Sales Processed: _____
Sync Success Rate: ____%
Failed Syncs: _____ (Target: 0)
Data anomalies detected: ✅ / ❌
Supabase storage usage: _____ (Expected: <1GB for test data)
```

---

## Daily Review (24h post-deploy)

### Executive Summary
```
Go-Live Status: ✅ GREEN / 🟡 YELLOW / 🔴 RED

Successes:
- _______________
- _______________

Issues Encountered:
- _______________
- _______________

Decisions Made:
- _______________
```

### Detailed Metrics

**Reliability**
```
Uptime: _____ % (Target: 99.9%)
Rollback Needed: ✅ / ❌
Critical Incidents: _____
Severity Breakdown:
  - Critical (🔴): _____
  - Major (🟠): _____
  - Minor (🟡): _____
```

**Performance**
```
Avg Response Time: _____ms
P50: _____ms | P95: _____ms | P99: _____ms
Slowest Endpoint: ________________ (_____ms)
Performance Regressions: ✅ / ❌
```

**Data**
```
Total Transactions: _____
Transaction Success Rate: _____%
Data Loss: ✅ / ❌ (None expected)
RLS Violations: _____ (Target: 0)
```

**User Feedback**
```
Operator Survey: ___% satisfied (Target: >85%)
Critical Blockers: _____
Top Feature Requests: _____
UX Issues Reported: _____
```

---

## Alert Decision Matrix

| Condition | Action | Escalation |
|-----------|--------|-----------|
| Error rate stable, < 5/min | Monitor | No escalation |
| Error rate 5-20/min, specific exception | Investigate | Notify Tech Lead |
| Error rate > 20/min OR unidentified spike | Page on-call engineer | Notify Tech Lead + Product |
| Sync broken (gerente can't see sales) | URGENT — investigate RPC | Page on-call engineer |
| Auth system broken (operators can't login) | CRITICAL — prepare rollback | Page CEO + Tech Lead |
| Data corruption or loss detected | CRITICAL — ROLLBACK | Page CEO + Legal |

---

## Rollback Trigger Checklist

Rollback decision if ANY of these occur:

- [ ] Uncontrolled error rate (> 50 errors/min for > 5min)
- [ ] Auth system degraded (login failing for > 10% of users)
- [ ] Sync broken (sales not appearing in gerente for > 5min)
- [ ] Data loss or corruption detected
- [ ] Critical security breach

**If triggered**: Execute GO-LIVE-RUNBOOK.md → Rollback Procedure section

---

## Sample Monitoring Dashboard (Notion / Slack)

```
📊 GO-LIVE MONITORING — Jul 23, 2026

🟢 Status: OPERATIONAL

Last Updated: 11:35am UTC
Uptime: 99.8% | Errors: 3 | Avg Latency: 1850ms

🚀 Milestones:
✅ 10:00am — Deploy successful
✅ 10:15am — All smoke tests passing
✅ 10:30am — Gerente seeing sales
⏳ 12:00pm — 2-hour checkup (20 min)

⚠️ Known Issues:
- 10:23am: 1 login timeout (resolved, 1 error)

📈 Metrics:
  Errors: 3 (↓ decreasing)
  P95 Latency: 2100ms (↓ improving)
  Sync Lag: 42s avg (✅ normal)
```

---

## Sign-Off Template

### Daily Report
```
Date: ___________
Reporter: ___________
Status: ✅ GREEN / 🟡 YELLOW / 🔴 RED

Summary:
[Brief 1-2 sentence assessment]

Key Metrics:
- Uptime: ____%
- Error Rate: _____/min
- Avg Latency: _____ms

Decisions:
[ ] Continue monitoring
[ ] Investigate issue
[ ] Prepare hotfix
[ ] Initiate rollback

Next Review: ___________ at ___________
```

### Week-1 Retrospective
```
Deployment Date: Jul 23, 2026
Post-Launch Period: Jul 23-30, 2026

✅ What Went Well:
- _______________
- _______________

🟡 What Could Improve:
- _______________
- _______________

🔴 Critical Issues:
- _______________
- _______________

Action Items (Next Phase):
- [ ] _______________
- [ ] _______________
- [ ] _______________

Owner: ___________
Due Date: ___________
```

---

## Useful Commands & Links

### Monitoring Dashboards
- Sentry: https://sentry.io/projects/fastproduct/
- Vercel: https://vercel.com/jinlong/pdv-importados
- Supabase: https://supabase.com/dashboard/project/[project-ref]

### Quick Health Checks
```bash
# API Health
curl https://fastproduct.vercel.app/api/health

# Recent errors (Sentry CLI)
sentry releases list                    # List recent deployments
sentry issues list --limit 10           # Top 10 issues

# Database stats (Supabase)
# Via dashboard: Docs > SQL Editor > select count(*) from outbox_events;
```

### Rollback Decision Matrix
```
If errors spike (> 50/min) → ROLLBACK
If auth breaks (> 10% failed logins) → ROLLBACK  
If sync down (gerente doesn't see sales) → ROLLBACK
If data loss detected → ROLLBACK immediately
Otherwise → Fix forward, monitor, document
```

---

**Print this template for your war room! 📋**
