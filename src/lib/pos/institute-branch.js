export function normalizeInstituteBranchName(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function filterInstituteLedgerByBranch(ledger, branchName) {
  const normalizedBranch = normalizeInstituteBranchName(branchName);
  const courses = (ledger?.cursos || []).filter(
    (course) =>
      normalizeInstituteBranchName(course.sucursalNombre) === normalizedBranch,
  );

  return {
    ...ledger,
    cursos: courses,
    deudaTotal: courses.reduce(
      (total, course) => total + Number(course.deudaTotal || 0),
      0,
    ),
  };
}
