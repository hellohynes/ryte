# Pricing decision: Lumen Studio

> We should charge for the outcome, not the seat count. Simple tiers beat clever metering.

Status: decided on 12 Mar. Owner: product. Review again after two quarters of data.

## Context

Lumen Studio started with a flat monthly price. As teams grew, the pricing page became the most-visited and most-confusing page on the site. Support kept getting the same question: "what do I actually pay for?"

## Options considered

| Option | Monthly price | Pros | Cons |
| --- | --- | --- | --- |
| Per seat | $12 / seat | Familiar, easy to forecast | Punishes growing teams |
| Usage based | $0.04 / render | Fair for light users | Bills are unpredictable |
| Three tiers | $0 / $19 / $50 | Clear upgrade path | Needs careful limits |

## Decision

- Move to three tiers: Free, Pro, and Team
- Keep the free tier generous enough to evaluate real work
- Annual billing gets two months free
- Grandfather existing customers for 12 months

## Rollout checklist

- [x] Draft new pricing page copy
- [ ] Billing dry run
- [ ] Update the help center
- [ ] Email existing customers

## Billing snippet

```json
{ "plan": "pro", "interval": "year", "free_months": 2 }
```

## Open questions

- Should the Team tier include a seat minimum?
- How do we handle education discounts?
