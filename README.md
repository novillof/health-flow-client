# Fibrosis Care

**FHIR-enabled patient registry, clinical history viewer, liver fibrosis risk assessment, and follow-up management application.**

Fibrosis Care is a web application developed as part of the **Medblocks FHIR App Challenge**.

The application connects to a **FHIR R4 server** to retrieve and manage patient records, display clinical information, calculate liver fibrosis risk using the **FIB-4 index**, and support enrollment into a follow-up pathway for patients with a high-risk result.

The project demonstrates how standardized healthcare interoperability data can be combined with simple, explainable clinical decision support.

> **Disclaimer:** This application is intended for educational and demonstration purposes only. FIB-4 is a risk stratification tool and does not establish a diagnosis of liver fibrosis. Results should always be interpreted in the appropriate clinical context.

---

## Live Demo

**Application:**  
https://health-flow-client.lovable.app/

**Source code:**  
https://github.com/novillof/health-flow-client

---

## Features

### Patient Registry

The application provides a patient registry backed by a live **FHIR R4 server**.

Users can:

- List patients retrieved from the FHIR server
- Search patients by name
- Create new patients
- Edit existing patients
- Delete patients
- Sort patients by name, gender, date of birth, or fibrosis risk
- Quickly identify patients according to their fibrosis risk

The registry displays:

- Full name
- Gender
- Date of birth
- Fibrosis risk
- Patient management actions

The fibrosis risk indicator is calculated from the patient's available FHIR clinical data and displayed directly in the patient list.

---

## Patient Clinical Summary

Selecting a patient opens a clinical summary populated from FHIR resources.

### Demographics

Information obtained from the `Patient` resource:

- Name
- Gender
- Date of birth

### Vital Signs

The application displays available vital signs such as:

- Blood pressure
- Heart rate
- Temperature
- Respiratory rate
- Oxygen saturation
- Height
- Weight
- BMI

These values are retrieved from FHIR `Observation` resources.

### Conditions

Active diagnoses and clinical problems are displayed from FHIR `Condition` resources.

### Medications

Active medications are displayed from FHIR `MedicationRequest` resources.

---

# Liver Fibrosis Risk Assessment

Fibrosis Care provides a **FIB-4 (Fibrosis-4) assessment** for eligible adult patients.

FIB-4 is a non-invasive risk stratification index used to estimate the likelihood of advanced liver fibrosis.

The calculation combines information from multiple FHIR resources:

| Input | FHIR source |
|---|---|
| Age | `Patient.birthDate` |
| AST | `Observation` — LOINC `1920-8` |
| ALT | `Observation` — LOINC `1742-6` |
| Platelet count | `Observation` — LOINC `777-3` |

### Formula

```text
FIB-4 = (Age × AST) / (Platelet count × √ALT)
```

---

## Getting Started

### Prerequisites

- Node.js

- npm

- Access to a compatible FHIR R4 server

### Installation

Clone the repository:

```bash

git clone https://github.com/novillof/health-flow-client.git

cd health-flow-client

```

Install dependencies:

```bash

npm install

```

Start the development server:

```bash

npm run dev

```

The application will be available through the Vite development server.

---

## Available Scripts

### Development

```bash

npm run dev

```

Starts the development server.

### Production build

```bash

npm run build

```

Builds the application for production.

### Preview

```bash

npm run preview

```

Previews the production build locally.

### Lint

```bash

npm run lint

```

Runs ESLint.

### Format

```bash

npm run format

```

Formats the project using Prettier.

---

## FHIR Server Configuration

The application connects to a FHIR R4 server to retrieve patient and clinical data.

The FHIR endpoint and authentication configuration should be provided through the application's configuration or environment mechanism.

**Never commit API tokens, Bearer tokens, passwords, or other credentials to the repository.**

---

## Clinical Safety

Fibrosis Care is a **demonstration and educational application** and is not intended for use in clinical practice.

- FIB-4 is a risk stratification tool and not a diagnostic test.

- A high FIB-4 score does not establish a diagnosis of liver fibrosis.

- Missing data must not be interpreted as absence of disease.

- Results should be interpreted together with the complete clinical history.

- Local clinical guidelines and professional judgement should always take precedence.

---

## Medblocks FHIR App Challenge

This project was developed as part of the **Medblocks FHIR App Challenge**.

The application demonstrates:

- Patient management using FHIR R4

- Retrieval of clinical history

- Use of `Observation`, `Condition`, and `MedicationRequest` resources

- LOINC and SNOMED CT terminology

- FIB-4 clinical risk calculation

- Explainable clinical decision support

- Fibrosis follow-up pathway enrollment

The extended clinical workflow can be summarized as:

```text

FHIR interoperability

        ↓

Clinical data retrieval

        ↓

LOINC / SNOMED CT interpretation

        ↓

FIB-4 calculation

        ↓

Risk stratification

        ↓

Fibrosis Follow-up Pathway

```

---

## Technology Stack

- React 19

- TypeScript

- Vite

- TanStack Start

- TanStack Router

- TanStack React Query

- Tailwind CSS

- Radix UI

- Lucide React

- React Hook Form

- Zod

- FHIR R4 REST API

The application was developed with the assistance of **Lovable**.
