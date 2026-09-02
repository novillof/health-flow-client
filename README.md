# Patient Connect

Build a Patient Management App that connects to a FHIR R4 server.

FHIR Server Base URL: prompt me for providing it as a secret / env

Use Header: Authorization: Bearer (prompt me for providing it as a secret)

All patient data should be read from and written to this FHIR server using the FHIR REST API. Do not use any local state or mock data.

Features:

List patients: On load, fetch all patients from the FHIR server and display them in a table or list. Show each patient’s full name, gender, and date of birth.

Create a patient: Include a form with the following fields:

Full name (given and family)

Gender (male, female, other, unknown)

Date of birth

Validate all fields before submitting. On submit, POST a valid FHIR Patient resource to the server. Refresh the patient list after a successful save.

Edit and update a patient: Each patient in the list should have an Edit button. Clicking it should open the same form pre-filled with that patient’s details. On submit, PUT the updated Patient resource back to the server using the patient’s ID. Refresh the list after a successful update.

Search by name: Include a search input that filters patients by name. Use the FHIR search parameter name and support partial search.

Technical requirements:

Setup a simple FHIR Proxy on the backend that will pass all the FHIR API calls to the actual FHIR server after including the Authorization header.

Call the backend FHIR proxy from the browser using fetch with all search parameters

Patient resources must follow the FHIR R4 structure:

Name should use name[0].given (array) and name[0].family (string)

Gender should use the gender field

Date of birth should use the birthDate field in YYYY-MM-DD format

Show a loading state while fetching

Show clear error messages if a request fails

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://health-flow-client.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2447e1f9-6910-4486-a874-6480cbf7c2fd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
