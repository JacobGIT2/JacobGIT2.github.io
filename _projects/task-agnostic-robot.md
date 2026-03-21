---
title: "Task-Agnostic Robot Self-Modeling"
tags: [Computer Vision, Robotics, 3D Reconstruction]
date: 2025-09-01
github: "https://github.com/JacobGIT2"
excerpt_text: "A pipeline to reconstruct robot URDFs from 2D video using vision foundation models and 3D reconstruction."
---

## Motivation

Robots need accurate self-models to plan and execute tasks effectively. Traditional approaches require manual CAD modeling or specialized sensors. Can we instead let a robot build its own model from simple 2D video?

## Approach

Developed a vision-based pipeline for reconstructing robot URDF models from monocular video:

- **Semantic Segmentation** — Fine-tuned DINO v2 on PartNet-Mobility dataset for part-level robot segmentation
- **3D Reconstruction** — Applied state-of-the-art methods (VGGT, DUSt3R) for reconstructing 3D geometry from 2D observations
- **URDF Generation** — Automated pipeline to convert segmented 3D parts into kinematic models (URDF format)

Added vision modality to the robot self-model pipeline at Creative Machine Lab, exploiting fine-grained segmentation for accurate part decomposition.

## Results

The pipeline successfully reconstructs robot morphology from video, producing URDF models that can be used for downstream simulation and planning tasks.

## Significance

This work contributes to the vision of robots that can autonomously build and update their own models — a key capability for adaptive and resilient robotic systems.
