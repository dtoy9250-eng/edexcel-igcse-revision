# Double Award, separate sciences and practice demand

## Requested scope
The platform continues to target the linear Edexcel International GCSE qualifications originally requested, now including Science Double Award (4SD0). UK GCSE Higher-tier qualifications are different specifications and are not silently mixed into this catalog.

| Programme | Official qualification(s) | Papers | Awards |
|---|---|---|---|
| Double Award | 4SD0 | 4SD0/1B, 4SD0/1C, 4SD0/1P; each 110 marks and 120 minutes | Two grades from a 330-mark qualification |
| Separate sciences (triple) | 4BI1, 4CH1, 4PH1 | Two papers per subject: 110 marks/120 minutes and 70 marks/75 minutes | Three separate subject qualifications, each out of 180 marks |

These International GCSE qualifications are untiered. “Triple” is a programme description, not an invented official qualification code. Do not sum the separate qualification marks into an invented combined grade. No grade boundary or official Pearson AI mark is supplied.

## Higher-demand practice, not an invented Higher tier
New practice choices are Standard exam demand, Higher demand and Challenge. Higher demand (`stretch`) is the default. There is no new Foundation practice option. The earlier development term “foundation checkpoint” referred to the software core, not an official exam tier.

Required core content remains included: harder Double Award questions must still assess Double Award content. Separate sciences can additionally use verified extension objectives. Course-aware question/mock validators enforce those boundaries. The future UI and server handlers must use these validators and derive qualification membership from the selected programme rather than trusting request fields.

The migration preserves immutable historical records with the old difficulty value for audit purposes, while blocking new Foundation-labelled question inserts and preferences. Existing unclassified mock history remains readable. All new application mock requests must set a qualification explicitly; the qualification-paper FK and programme guard then enforce the selected course.

## Official Double Award source
[Science Double Award specification, Issue 4 — September 2024](https://qualifications.pearson.com/content/dam/pdf/International%20GCSE/Science%20(Double%20Award)/2017/specification-and-sample-assessments/international-gcse-science-double-award-2017-specification1.pdf)

Downloaded and inspected on 9 November 2026. PDF pages 8, 13–15 and 65 establish untiered assessment, paper structure and the 330-mark total. SHA-256: `5780fb046368974e2aad45415448682634a8e9afcab77bfd29fdf61cec56ac17`.

The PDF is not redistributed here. This is the linear 4SD0 qualification, not the modular route. Recheck Pearson updates before release.
