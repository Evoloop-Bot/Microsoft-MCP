import { z } from "zod";
import type { GraphClient } from "../graph/client.js";

interface Person {
  displayName: string;
  emailAddresses?: { address: string }[];
  jobTitle?: string | null;
  department?: string | null;
}

// ---------- people_search ----------

export const peopleSearchInputSchema = z.object({
  query: z.string().min(2).describe("Search string (minimum 2 characters)."),
  top: z.number().int().min(1).max(20).default(10).describe("Maximum people to return (1-20).")
});

export type PeopleSearchInput = z.infer<typeof peopleSearchInputSchema>;

export interface PeopleSearchOutput {
  people: {
    displayName: string;
    emailAddresses: string[];
    jobTitle: string | null;
    department: string | null;
  }[];
}

export async function peopleSearch(client: GraphClient, input: PeopleSearchInput): Promise<PeopleSearchOutput> {
  const response = await client.request<{ value: Person[] }>("/me/people", {
    query: {
      $search: `"${input.query}"`,
      $select: "displayName,emailAddresses,jobTitle,department",
      $top: input.top
    }
  });

  return {
    people: response.value.map((p) => ({
      displayName: p.displayName,
      emailAddresses: (p.emailAddresses ?? []).map((e) => e.address),
      jobTitle: p.jobTitle ?? null,
      department: p.department ?? null
    }))
  };
}
