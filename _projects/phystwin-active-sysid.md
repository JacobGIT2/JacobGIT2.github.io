---
title: "Active System Identification for Physics Twins of Deformable Objects"
tags: [Differentiable Physics, System Identification, Active Learning, Uncertainty, NVIDIA Warp]
date: 2026-09-01
excerpt_text: "Ongoing. A spring-mass twin fitted to one video of a plush toy or rope looks perfect and is still physically undetermined. I study how to expose that ambiguity (ensembles, not mean-field posteriors) and how a robot should choose its next interaction to resolve it."
---

<p class="status-banner"><strong>Work in progress</strong> (May 2026 – present). Built on top of
<a href="https://jianghanxiao.github.io/phystwin-web/">PhysTwin</a> (Jiang et al., ICCV 2025), a differentiable spring-mass
twin reconstructed from RGB-D video. The code lives in a private fork; an
<a href="https://yuwengong2c-collab.github.io/visual/?run=fim/testset_grid">interactive rollout viewer</a> of the latest results is public.
Findings below are current as of September 2026 and will change.</p>

## The question

PhysTwin turns a short video of a person lifting a plush sloth or a rope into a simulator:
roughly 10<sup>5</sup> springs, each with its own stiffness, fitted by gradient descent through the
physics. The fit is excellent on the recorded motion. My question is the one that matters for using
the twin afterwards: **does one video actually pin down the physics, and if not, which interaction
should the robot perform next to pin it down?**

<video autoplay loop muted playsinline src="{{ '/assets/img/projects/phystwin-active-sysid/sloth_sigma_training.mp4' | relative_url }}"></video>
<p class="fig-cap">Training a probabilistic PhysTwin on a two-hand lift. Colour is the learned per-spring uncertainty
(posterior log&nbsp;σ). Note the end state: almost uniform. The posterior ends up saying nothing about
<em>where</em> the video constrained stiffness. Understanding why is where this project started.</p>

## One video, three different physics

Take the same rope video and fit three twins that differ only in their initial stiffness guess
(soft 10<sup>3</sup>, the CMA-ES estimate 8&nbsp;276, stiff 5×10<sup>4</sup>). All three reach the same
training loss and overlay the recorded lift indistinguishably. Then ask them a new question, an axial drag
that the video never showed, and they disagree by 16× (33&nbsp;mm between models versus 2&nbsp;mm on the training action).

<div class="fig-row">
  <div>
    <video autoplay loop muted playsinline src="{{ '/assets/img/projects/phystwin-active-sysid/multisol_seen_action.mp4' | relative_url }}"></video>
    <p class="fig-cap">Seen action (the recorded lift): three fits, three colours, one rope.</p>
  </div>
  <div>
    <video autoplay loop muted playsinline src="{{ '/assets/img/projects/phystwin-active-sysid/multisol_new_action.mp4' | relative_url }}"></video>
    <p class="fig-cap">Unseen action (axial drag): the same three fits come apart. The soft twin folds, the stiff one keeps a V.</p>
  </div>
</div>

This is the whole problem in one picture. Fitting a trajectory does not identify the material; the
disagreement between equally good fits <em>is</em> the epistemic uncertainty, and it only becomes visible
when you ask a question the data did not answer. That also suggests the remedy: the interaction that
would make the fits disagree most is the one worth recording next.

## Why the Bayesian version cannot see it

The fork I inherited adds a variational posterior over every spring's log-stiffness (a mean-field Gaussian,
trained with the reparameterisation trick and a KL term inside the Warp simulator). If that posterior
were honest, sampling it and rolling out should reproduce the spread above. It does not.

<div class="fig-row">
  <div>
    <video autoplay loop muted playsinline src="{{ '/assets/img/projects/phystwin-active-sysid/meanfield_mc_sloth.mp4' | relative_url }}"></video>
    <p class="fig-cap">Thirty posterior samples of the sloth twin, transferred to a new stretch interaction and rendered through the
    twin's Gaussian splats. Each sample's silhouette is traced in its own colour. The rainbow band is sub-pixel wide while the
    actual prediction error is about 15&nbsp;mm; the 2σ interval covers essentially none of it.</p>
  </div>
  <div>
    <video autoplay loop muted playsinline src="{{ '/assets/img/projects/phystwin-active-sysid/meanfield_mc_rope_new_action.mp4' | relative_url }}"></video>
    <p class="fig-cap">Same test on the rope, same unseen axial drag as above: 24 posterior samples (colour bar at top) stay within a
    few millimetres of each other, a third of what the three deterministic fits showed.</p>
  </div>
</div>

Controlled experiments with a synthetic ground truth (a rope with a known per-spring stiffness field, simulated with the
same engine) isolated two causes:

- **σ is set by the KL weight, not by the data.** Remove the KL term and σ freezes at its initial value; keep it and σ
  collapses onto the prior for 99% of springs. The correct direction of the signal exists (high-strain springs get slightly
  smaller σ) but its magnitude is a few percent.
- **Independence cancels.** Sampling 10<sup>5</sup> springs independently makes their effects on the trajectory average
  out. Replacing the independent samples with a single coherent perturbation, without retraining, brings the
  error-to-spread ratio from 22 down to 1.3. A learned low-rank correlated posterior helps only partially, because the
  calibrating mode lives in the data's null space where the likelihood offers no gradient and the isotropic prior kills it.

The practical conclusion for the rest of the project: represent uncertainty with an <strong>ensemble of deterministic fits</strong>
(the posterior as particles), whose disagreement is spatially coherent and tracks identifiability, rather than with a
per-spring Gaussian.

## Closing the loop

With a known synthetic truth I can run the full active loop: keep an ensemble of stiffness hypotheses, search for the
interaction on which they disagree most, apply it to the true object, refit on the new observation, repeat.

<video autoplay loop muted playsinline src="{{ '/assets/img/projects/phystwin-active-sysid/active_refit_before_after.mp4' | relative_url }}"></video>
<p class="fig-cap">Top: an ensemble trained on the lift alone already matches the lift (2&nbsp;mm) but is 23&nbsp;mm off on the
action it disagrees most about. Bottom: after one refit on that action, 4&nbsp;mm on the new action and no loss on the old one.</p>

<video autoplay loop muted playsinline src="{{ '/assets/img/projects/phystwin-active-sysid/active_loop_round.mp4' | relative_url }}"></video>
<p class="fig-cap">One round of the closed loop on a lying rope with a grasped hand: ensemble spread (div) and error against truth before and after the refit.</p>

Making this loop cheap took most of the engineering:

- **Batched simulator.** All ensemble members are packed as one block-diagonal spring-mass system, so a rollout or a
  system-identification step over the whole ensemble is a single Warp simulation. Forward, loss and backward are captured in
  one CUDA graph (one launch per frame instead of thousands), a 2.6× speedup with the GPU at 85%.
- **Streaming and cumulative refits.** Each round trains only from the new observation, warm-started; a replay variant
  fixes the forgetting that pure streaming showed.
- **Zero-order action search.** The simulator detaches between frames by design, so full-trajectory gradients through the
  controller are not available; CMA-ES over grasp waypoints is cheap enough because scoring an action is one batched rollout.

## What an interaction actually buys

The synthetic world also lets me measure the thing the selector is supposed to optimise: how much a held-out error drops
after training on a given action. I built a grasp-anywhere action space on the rope (19 equal-length drags: top lifts at
five sites, end pulls and pushes, side pulls and pushes) and trained on each one separately.

- Every action helps, but **ensemble disagreement does not predict how much** (rank correlation about zero). The most
  disagreed-about actions, pushing the rope ends into a buckle, are the hardest to predict and among the least useful to train on first.
- **Action type dominates.** All five top lifts are the five most useful actions; within a family the differences are small.
- **Order matters more than the set.** Learning the general field on gentle actions first and only then training on the
  buckling ones ends with the best model everywhere (7.5&nbsp;mm mean over all 19 actions versus 9.3 for disagreement-greedy
  and 9.7 for a fixed-information score), because the same hard action costs 11&nbsp;mm more when trained early.
- What does predict payoff is a GT-free statistic of the ensemble's response: how many modes of the action's response rise
  above the noise floor. Clean, low-dimensional responses are the informative ones in this near-homogeneous world.

## Toward a designed experiment

Per-spring stiffness is the wrong search space for choosing actions: too many degrees of freedom, and the pushes are
numerically chaotic when rolled out freely. The current learner therefore re-parameterises stiffness as amplitudes on a
small set of fixed kernels along the rope, fits them with teacher-forced one-step residuals and Levenberg–Marquardt,
and uses the resulting Fisher information to pick the next action (D-optimal design).

<video autoplay loop muted playsinline src="{{ '/assets/img/projects/phystwin-active-sysid/kernel_dopt_heldout.mp4' | relative_url }}"></video>
<p class="fig-cap">Held-out test interactions after D-optimal action selection with 16 kernels: a lift, three different pushes and a
two-hand action. Orange is the truth, blue the model. Explore every arm and action in the
<a href="https://yuwengong2c-collab.github.io/visual/?run=fim/testset_grid">interactive viewer</a>.</p>

A control where the truth itself lies in the kernel family shows the machinery is correct: predicted information gain
equals realised gain and the Laplace uncertainty is calibrated. The residual model error on the real per-spring truth
(0.27&nbsp;mm) is entirely the family not being expressive enough, which tells me where the next change has to go.

## Real data: Deform360

The repository's own recordings give at most a handful of interactions per object. To test "one twin, many excitations"
on real objects I wired in <a href="https://huggingface.co/datasets/brownu/deform360_processed">Deform360</a>
(ten robot episodes per object with tracked point clouds and gripper poses). Each object gets one fixed twin, rigidly
posed into every episode, with the gripper's contact taxels as the controller.

<img src="{{ '/assets/img/projects/phystwin-active-sysid/deform360_rope_episodes.png' | relative_url }}" alt="Three Deform360 rope episodes with the fixed twin rigidly registered">
<p class="fig-cap">Three episodes of one rope: the fixed twin (blue) posed into each episode's start cloud, the tracked end state (orange),
and the gripper before and after (red, green). Episodes whose rest shape no longer matches the twin are excluded.</p>

The honest result so far: the disagreement signal works on real data (rank correlation with true error 0.75 to 0.93),
but per-spring refits make the held-out episodes slightly <em>worse</em>, and the untrained ensemble is the best model.
What one episode teaches does not transfer, because the dominant residual is global (no per-object global calibration,
a surface-only twin, a gripper stand-in for the hand) rather than spatial stiffness. That is the next lever.

## Where this stands

- Ambiguity after fitting one video is real, action-dependent, and large. Ensembles expose it; the mean-field posterior hides it for structural reasons.
- Disagreement is a good map of where a twin will be wrong and a poor guide to what training will fix. Sequencing gentle actions before hard ones matters more than any single selection rule.
- A low-dimensional stiffness family plus classical experimental design is calibrated and cheap, and now limited by expressiveness.
- Next: per-object global calibration on Deform360, a richer but still designable stiffness family, and real closed-loop trials (a gamepad-driven live recorder for the twin and an xArm6 setup are in place).
