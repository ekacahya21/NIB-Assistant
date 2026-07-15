# 0001-modularizing-automation-service

We decided to refactor the monolithic, 3,800-line `AutomationService` into separate NestJS provider classes (`PortalInteractionHelper`, `RegistrationFlowService`, `FilingFlowService`) coordinated via a shared `AutomationSessionContext`. This decomposition balances readability, single-responsibility separation, and mockability without introducing the overhead of a strict command/strategy pattern.
