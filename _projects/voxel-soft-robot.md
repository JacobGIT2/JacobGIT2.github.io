---
title: "Voxel-Based Soft Robot Co-Design"
tags: [Robotics, GPU Simulation, Evolutionary Optimization]
date: 2025-08-01
github: "https://github.com/JacobGIT2"
excerpt_text: "Two GPU-accelerated frameworks for joint morphology-control co-optimization of voxel-based soft robots."
---

## Motivation

Designing soft robots requires simultaneously optimizing both their physical structure (morphology) and control policy — a computationally expensive process. Traditional CPU-based approaches cannot scale to the massive evaluations needed for evolutionary optimization.

## Approach

Built two GPU-accelerated frameworks for voxel-based soft robot co-design:

- **Diff-CoDesign** — Built on Taichi Lang, leveraging differentiable physics for gradient-based optimization
- **VoxelCoDesign** — Built on NVIDIA Warp, using evolutionary strategies with mass-spring physics simulation

Key technical contributions:
- Achieved **10.8x topology build speedup** through GPU parallelization
- Batch-evaluated **200 robots per generation** across 35 independent runs of 1000 generations each
- Completed **7 million total evaluations** for comprehensive design space exploration
- Implemented reverse-mode automatic differentiation for physics-based gradient computation

## Results

The frameworks demonstrate that GPU-accelerated co-design can make previously intractable optimization problems feasible, enabling thorough exploration of the joint morphology-control design space for soft robots.

## Significance

This work bridges the gap between evolutionary robotics and modern GPU computing, showing that massively parallel simulation can unlock new possibilities in automated robot design.
