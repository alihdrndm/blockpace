# Assumptions

Hotel contracts differ. These are the modelling choices blockpace makes, not verified against any real contract. The output is an estimate; the signed contract governs.

| ID | Assumption |
|----|------------|
| **ASSUMED B1** | On the cumulative basis, shortfall room nights are charged at the contracted-room-weighted average rate. Some contracts name a single "group rate" or charge the lowest rate instead. |
| **ASSUMED B2** | A fractional minimum is rounded up by default (`minimumRounding: "ceil"`), the more cautious choice for the planner. |
| **ASSUMED B3** | Tax, when set, is a single percentage of damages. Many contracts charge no tax on attrition damages. |
| **ASSUMED B4** | Resell credit reduces the shortfall one room night for one room night, capped at the shortfall (per night on the per-night basis). |
| **ASSUMED B5** | Pickup is whatever the snapshot reports. Whether reservations made after the cutoff date, or outside the block, count toward pickup is decided by the contract, not by this tool. |
| **ASSUMED B6** | The forecast is a straight-line continuation of the last 14 days of pickup per night, capped at contracted rooms. It is a simple pace indicator, not a prediction model. |
