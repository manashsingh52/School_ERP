"""
Builds the sample Excel sheets a school fills in for Bastaa's Import from Excel.

    python3 docs/samples/imports/build.py

Column names are the importer's own field labels (packages/contracts/src/imports.ts), so every
column maps by itself on upload. The importer reads only the FIRST sheet of a workbook, so the
data sheet comes first and "How to fill" second. apps/api/test/import-samples.e2e.test.ts uploads
every file through the real importer and fails if a row is rejected: rebuild and re-run it after
changing the importer.
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).parent
EMERALD = "0F5338"
HEAD_FILL = PatternFill("solid", fgColor=EMERALD)
REQ_FILL = PatternFill("solid", fgColor="D95D39")
HEAD_FONT = Font(bold=True, color="FFFFFF", name="Calibri", size=11)
NOTE_FONT = Font(color="57606A", italic=True, size=10)
THIN = Side(style="thin", color="E3E6EA")
GRID = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def data_sheet(wb, title, columns, rows, dropdowns=None):
    """columns: (header, required, width, is_text). Row 1 is the header row the importer reads."""
    ws = wb.active
    ws.title = title
    for c, (head, req, width, _text) in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=c, value=f"{head} *" if req else head)
        cell.font = HEAD_FONT
        cell.fill = REQ_FILL if req else HEAD_FILL
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        cell.border = GRID
        ws.column_dimensions[get_column_letter(c)].width = width
    ws.row_dimensions[1].height = 34
    for r, row in enumerate(rows, start=2):
        for c, value in enumerate(row, start=1):
            cell = ws.cell(row=r, column=c, value=value if value != "" else None)
            cell.border = GRID
            if columns[c - 1][3]:
                cell.number_format = "@"  # text: keeps leading zeros, phone digits and DD/MM/YYYY as typed
    # Text format on empty rows too, so what the school types later stays as typed
    for r in range(len(rows) + 2, 1001):
        for c, col in enumerate(columns, start=1):
            if col[3]:
                ws.cell(row=r, column=c).number_format = "@"
    ws.freeze_panes = "A2"
    for col_index, values in (dropdowns or {}).items():
        dv = DataValidation(type="list", formula1='"' + ",".join(values) + '"', allow_blank=True, showErrorMessage=False)
        letter = get_column_letter(col_index)
        dv.add(f"{letter}2:{letter}1000")
        ws.add_data_validation(dv)
    return ws


def guide_sheet(wb, title, intro, columns, rules):
    """columns: (header, required, what to write, example)."""
    ws = wb.create_sheet("How to fill")
    ws["A1"] = title
    ws["A1"].font = Font(bold=True, size=14, color=EMERALD)
    row = 2
    for line in intro:
        ws.cell(row=row, column=1, value=line).alignment = Alignment(wrap_text=True, vertical="top")
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
        ws.row_dimensions[row].height = 30
        row += 1
    row += 1
    for c, head in enumerate(["Column", "Needed?", "What to write", "Example"], start=1):
        cell = ws.cell(row=row, column=c, value=head)
        cell.font = HEAD_FONT
        cell.fill = HEAD_FILL
        cell.border = GRID
    for head, req, what, example in columns:
        row += 1
        values = [head, "Yes" if req is True else ("No" if req is False else req), what, example]
        for c, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=c, value=value)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            cell.border = GRID
        ws.cell(row=row, column=1).font = Font(bold=True)
    row += 2
    ws.cell(row=row, column=1, value="Rules").font = Font(bold=True, size=12, color=EMERALD)
    for rule in rules:
        row += 1
        cell = ws.cell(row=row, column=1, value=f"• {rule}")
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
        ws.row_dimensions[row].height = 30
    for letter, width in zip("ABCD", (26, 12, 70, 24)):
        ws.column_dimensions[letter].width = width
    return ws


COMMON = [
    "Keep row 1 exactly as it is: the column names are how Bastaa recognises each column. Orange columns are needed; green ones are optional.",
    "Upload this file in Bastaa: Students (or Payments) → Import from Excel. You see every row checked before anything is saved; rows with a problem come back with the reason, in an Excel file you can fix and upload again.",
]
SAVE = "Save as Excel (.xlsx) or CSV. Up to 2,000 rows per file. Only the first sheet is read, so leave this sheet second."
DATES = "Dates: day first, DD/MM/YYYY (14/03/2016). 14-03-2016, 14.03.16 and 14 Mar 2016 also work."
PHONES = "Mobile numbers: 10 digits (9876543210). A leading 0, +91 or spaces are fine."


# ------------------------------------------------------------------------------- 1. classes

def classes():
    wb = Workbook()
    cols = [("Class", True, 16, True), ("Sections (A, B, C)", True, 22, True), ("Seats per section", False, 18, False), ("Order", False, 10, False)]
    rows = [
        ["Nursery", "A", 30, 1], ["LKG", "A, B", 30, 2], ["UKG", "A, B", 30, 3],
        ["Class 1", "A, B", 35, 4], ["Class 2", "A, B", 35, 5], ["Class 3", "A, B", 35, 6], ["Class 4", "A, B", 35, 7], ["Class 5", "A, B", 35, 8],
        ["Class 6", "A-C", 40, 9], ["Class 7", "A-C", 40, 10], ["Class 8", "A-C", 40, 11], ["Class 9", "A, B", 40, 12], ["Class 10", "A, B", 40, 13],
    ]
    data_sheet(wb, "Classes", cols, rows)
    guide_sheet(wb, "Classes and sections", COMMON + ["Upload this first: students and subjects refer to these classes."], [
        ("Class", True, "The class name as the school says it. A number alone (8) becomes \"Class 8\"; Nursery, LKG and UKG stay as written.", "Class 8"),
        ("Sections (A, B, C)", True, "The sections of this class this year: a list (A, B, C), a range (A-C) or a count (3 means A, B, C). Names like Rose, Lily also work.", "A, B, C"),
        ("Seats per section", False, "How many students a section can take, 1 to 200.", "40"),
        ("Order", False, "Where the class sits in lists. Leave blank and Nursery, LKG, UKG, Class 1… are ordered for you.", "11"),
    ], [SAVE, "A class that already exists is skipped, or gets only its new sections.", "One row per class."])
    wb.save(OUT / "1-Classes.xlsx")


# ------------------------------------------------------------------------------- 2. subjects

def subjects():
    wb = Workbook()
    cols = [("Subject", True, 22, True), ("Code", False, 10, True), ("Type (core / elective / co-scholastic)", False, 22, True), ("Taught in classes (1-5, 8 or All)", False, 26, True)]
    rows = [
        ["English", "ENG", "Core", "All"], ["Hindi", "HIN", "Core", "All"], ["Mathematics", "MATH", "Core", "All"],
        ["EVS", "EVS", "Core", "1-5"], ["Science", "SCI", "Core", "6-10"], ["Social Science", "SST", "Core", "6-10"],
        ["Sanskrit", "SKT", "Elective", "6-8"], ["Computer", "COMP", "Elective", "3-10"],
        ["Art", "ART", "Co-scholastic", "All"], ["Physical Education", "PE", "Co-scholastic", "All"],
    ]
    data_sheet(wb, "Subjects", cols, rows, {3: ["Core", "Elective", "Co-scholastic"]})
    guide_sheet(wb, "Subjects", COMMON + ["Upload after Classes, so \"Taught in classes\" can find them."], [
        ("Subject", True, "The subject's name.", "Mathematics"),
        ("Code", False, "A short code: letters and digits, up to 12. Leave blank and one is made from the name.", "MATH"),
        ("Type (core / elective / co-scholastic)", False, "Core (main subjects), Elective (students choose) or Co-scholastic (art, sports, music). Blank means Core.", "Core"),
        ("Taught in classes (1-5, 8 or All)", False, "Which classes study it this year: a range (1-5), a list (6, 7, 8), class names (Nursery, LKG) or All. Blank adds it without classes.", "6-10"),
    ], [SAVE, "A subject whose name already exists is linked to the classes listed; it isn't added twice."])
    wb.save(OUT / "2-Subjects.xlsx")


# ------------------------------------------------------------------------------- 3. teachers

TEACHERS = [
    ["EMP-001", "Sunita", "Verma", "9000001101", "sunita.verma@example.com", "F", "12/04/1984", "Mathematics", "TGT", "M.Sc, B.Ed", "01/06/2015"],
    ["EMP-002", "Rakesh", "Kumar", "9000001102", "rakesh.kumar@example.com", "M", "03/09/1980", "Science", "PGT", "M.Sc, B.Ed", "15/07/2012"],
    ["EMP-003", "Anjali", "Singh", "9000001103", "", "F", "21/01/1990", "English", "TGT", "M.A, B.Ed", "01/04/2018"],
    ["EMP-004", "Mohammed", "Arif", "9000001104", "m.arif@example.com", "M", "08/11/1987", "Social Science", "TGT", "M.A, B.Ed", "10/06/2016"],
    ["EMP-005", "Kavita", "Sharma", "9000001105", "", "F", "30/05/1992", "Hindi", "PRT", "B.A, D.El.Ed", "02/04/2019"],
    ["EMP-006", "Pooja", "Mehta", "9000001106", "pooja.mehta@example.com", "F", "17/02/1995", "Pre-primary", "NTT", "B.A, NTT", "01/04/2021"],
    ["EMP-007", "Vikram", "Rao", "9000001107", "", "M", "25/12/1986", "Computer", "TGT", "MCA", "01/07/2017"],
    ["EMP-008", "Neha", "Gupta", "9000001108", "neha.gupta@example.com", "F", "09/08/1991", "Primary", "PRT", "B.Sc, B.Ed", "05/04/2020"],
    ["EMP-009", "Suresh", "Yadav", "9000001109", "", "M", "14/03/1983", "Physical Education", "PET", "B.P.Ed", "20/06/2014"],
    ["EMP-010", "Ritu", "Bansal", "9000001110", "", "F", "02/10/1989", "Art", "Art teacher", "BFA", "01/04/2022"],
]


def teachers():
    wb = Workbook()
    cols = [("Employee ID", True, 13, True), ("First name", True, 14, True), ("Last name", False, 14, True), ("Mobile", True, 14, True), ("Email", False, 28, True), ("Gender", False, 9, True),
            ("Date of birth", False, 14, True), ("Department", False, 18, True), ("Designation", False, 14, True), ("Qualification", False, 16, True), ("Joining date", False, 14, True)]
    data_sheet(wb, "Teachers", cols, TEACHERS, {6: ["M", "F", "Other"]})
    guide_sheet(wb, "Teachers and staff", COMMON + ["Each teacher signs in with their mobile number; tick \"Invite to sign in\" on upload and the school office gives each one a sign-in code."], [
        ("Employee ID", True, "The school's staff ID, unique per person.", "EMP-001"),
        ("First name", True, "First name. (One \"Name\" column with the full name also works instead of First and Last.)", "Sunita"),
        ("Last name", False, "Surname.", "Verma"),
        ("Mobile", True, "Their own mobile number, unique per person. It's their sign-in.", "9000001101"),
        ("Email", False, "Email, if they have one.", "sunita@example.com"),
        ("Gender", False, "M or F (Male, Female and Other also work).", "F"),
        ("Date of birth", False, "DD/MM/YYYY.", "12/04/1984"),
        ("Department", False, "Subject or department.", "Mathematics"),
        ("Designation", False, "PRT, TGT, PGT, NTT, Coordinator…", "TGT"),
        ("Qualification", False, "Degrees.", "M.Sc, B.Ed"),
        ("Joining date", False, "DD/MM/YYYY.", "01/06/2015"),
    ], [SAVE, DATES, PHONES, "Two rows with the same Employee ID or mobile number are flagged; teachers already in Bastaa are skipped."])
    wb.save(OUT / "3-Teachers.xlsx")


# ------------------------------------------------------------------------------- 4. students

STUDENTS = [
    # adm, first, last, class, section, roll, dob, gender, admitted, blood, phone, email, address, city, state, pin, father, f phone, mother, m phone, guardian, g phone, parent email
    ["1001", "Aarav", "Sharma", "Nursery", "A", "1", "14/06/2022", "M", "01/04/2026", "B+", "", "", "12 Lalpur Road", "Ranchi", "Jharkhand", "834001", "Rohit Sharma", "9000002001", "Priya Sharma", "9000002101", "", "", "rohit.sharma@example.com"],
    ["1002", "Diya", "Patel", "LKG", "A", "1", "02/02/2021", "F", "01/04/2025", "O+", "", "", "45 Harmu Colony", "Ranchi", "Jharkhand", "834002", "Amit Patel", "9000002002", "Neha Patel", "9000002102", "", "", ""],
    ["1003", "Kabir", "Khan", "LKG", "B", "1", "19/09/2021", "M", "01/04/2025", "A+", "", "", "8 Doranda", "Ranchi", "Jharkhand", "834002", "Imran Khan", "9000002003", "Sana Khan", "9000002103", "", "", "imran.khan@example.com"],
    ["1004", "Myra", "Gupta", "UKG", "A", "1", "11/12/2020", "F", "01/04/2024", "B+", "", "", "22 Kanke Road", "Ranchi", "Jharkhand", "834008", "Sanjay Gupta", "9000002004", "Ritu Gupta", "9000002104", "", "", ""],
    ["1005", "Vihaan", "Singh", "UKG", "B", "2", "05/03/2020", "M", "01/04/2024", "O-", "", "", "3 Bariatu", "Ranchi", "Jharkhand", "834009", "Rajeev Singh", "9000002005", "Anita Singh", "9000002105", "", "", ""],
    ["1006", "Ananya", "Mishra", "Class 5", "B", "4", "14/03/2015", "F", "01/04/2020", "B+", "", "", "17 Morabadi", "Ranchi", "Jharkhand", "834008", "Rajesh Mishra", "9000002006", "Meena Mishra", "9000002106", "", "", "rajesh.mishra@example.com"],
    ["1007", "Rahul", "Mishra", "Class 8", "A", "12", "22/08/2012", "M", "01/04/2017", "B+", "", "", "17 Morabadi", "Ranchi", "Jharkhand", "834008", "Rajesh Mishra", "9000002006", "Meena Mishra", "9000002106", "", "", "rajesh.mishra@example.com"],
    ["1008", "Ishaan", "Verma", "Class 1", "A", "3", "30/07/2019", "M", "01/04/2025", "A-", "", "", "9 Ashok Nagar", "Ranchi", "Jharkhand", "834002", "Manoj Verma", "9000002008", "Kiran Verma", "9000002108", "", "", ""],
    ["1009", "Saanvi", "Reddy", "Class 2", "B", "7", "16/01/2018", "F", "01/04/2023", "AB+", "", "", "60 Argora", "Ranchi", "Jharkhand", "834002", "Srinivas Reddy", "9000002009", "Lakshmi Reddy", "9000002109", "", "", "s.reddy@example.com"],
    ["1010", "Aditya", "Kumar", "Class 3", "A", "2", "09/10/2017", "M", "01/04/2022", "O+", "", "", "5 Hinoo", "Ranchi", "Jharkhand", "834002", "Pankaj Kumar", "9000002010", "Sunita Kumari", "9000002110", "", "", ""],
    ["1011", "Kiara", "Das", "Class 4", "A", "9", "27/04/2016", "F", "01/04/2021", "B-", "", "", "14 Kokar", "Ranchi", "Jharkhand", "834001", "Subhash Das", "9000002011", "Rina Das", "9000002111", "", "", ""],
    ["1012", "Arjun", "Nair", "Class 5", "A", "1", "03/12/2015", "M", "01/04/2020", "A+", "", "", "31 Circular Road", "Ranchi", "Jharkhand", "834001", "Vinod Nair", "9000002012", "Asha Nair", "9000002112", "", "", "vinod.nair@example.com"],
    ["1013", "Fatima", "Ansari", "Class 6", "C", "5", "18/05/2014", "F", "01/04/2019", "O+", "", "", "2 Hindpiri", "Ranchi", "Jharkhand", "834001", "Salim Ansari", "9000002013", "Rukhsana Ansari", "9000002113", "", "", ""],
    ["1014", "Reyansh", "Joshi", "Class 7", "A", "14", "06/09/2013", "M", "01/04/2018", "B+", "", "", "77 Ratu Road", "Ranchi", "Jharkhand", "834005", "Deepak Joshi", "9000002014", "Shalini Joshi", "9000002114", "", "", ""],
    ["1015", "Aadhya", "Iyer", "Class 8", "B", "3", "12/02/2012", "F", "01/04/2017", "A+", "", "", "40 Kadru", "Ranchi", "Jharkhand", "834002", "Ganesh Iyer", "9000002015", "Uma Iyer", "9000002115", "", "", "ganesh.iyer@example.com"],
    ["1016", "Vivaan", "Choudhary", "Class 8", "C", "8", "29/11/2012", "M", "01/04/2017", "O+", "", "", "11 Lowadih", "Ranchi", "Jharkhand", "834004", "", "", "", "", "Ramesh Choudhary", "9000002016", ""],
    ["1017", "Anika", "Bose", "Class 9", "A", "6", "04/07/2011", "F", "01/04/2016", "AB-", "9000002217", "anika.bose@example.com", "25 Bariatu Housing Colony", "Ranchi", "Jharkhand", "834009", "Arindam Bose", "9000002017", "Mitali Bose", "9000002117", "", "", ""],
    ["1019", "Tanvi", "Saxena", "Class 8", "A", "13", "07/05/2012", "F", "01/04/2017", "O+", "", "", "52 Hehal", "Ranchi", "Jharkhand", "834005", "Alok Saxena", "9000002019", "Ruchi Saxena", "9000002119", "", "", ""],
    ["1020", "Yash", "Malhotra", "Class 8", "A", "14", "19/10/2012", "M", "01/04/2017", "A+", "", "", "8 Booty More", "Ranchi", "Jharkhand", "834009", "Karan Malhotra", "9000002020", "Simran Malhotra", "9000002120", "", "", ""],
    ["1018", "Krish", "Agarwal", "Class 10", "B", "10", "15/01/2010", "M", "01/04/2015", "B+", "9000002218", "", "6 Main Road", "Ranchi", "Jharkhand", "834001", "Naveen Agarwal", "9000002018", "Pooja Agarwal", "9000002118", "", "", "naveen.agarwal@example.com"],
]


def students():
    wb = Workbook()
    cols = [("Admission number", True, 14, True), ("First name", True, 12, True), ("Last name", False, 12, True), ("Class", True, 10, True), ("Section", True, 9, True), ("Roll number", False, 9, False),
            ("Date of birth", False, 13, True), ("Gender", False, 8, True), ("Admission date", False, 13, True), ("Blood group", False, 8, True), ("Student phone", False, 13, True), ("Student email", False, 22, True),
            ("Address", False, 24, True), ("City", False, 10, True), ("State", False, 12, True), ("PIN code", False, 9, True),
            ("Father's name", False, 16, True), ("Father's phone", False, 13, True), ("Mother's name", False, 16, True), ("Mother's phone", False, 13, True),
            ("Guardian name", False, 16, True), ("Guardian phone", False, 13, True), ("Parent email", False, 26, True)]
    rows = [r[:5] + [int(r[5]) if r[5] else ""] + r[6:] for r in STUDENTS]
    data_sheet(wb, "Students", cols, rows, {8: ["M", "F", "Other"], 10: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]})
    guide_sheet(wb, "Students and parents", COMMON + ["Upload after Classes (each student's class and section must exist). Parents are created from the phone numbers: brothers and sisters with the same father's or mother's phone are linked to the same parent, who sees both children in the app."], [
        ("Admission number", True, "The school's admission or scholar number, unique per student. Up to 30 characters; leading zeros are kept.", "1001"),
        ("First name", True, "Student's first name. (One \"Student name\" column with the full name also works.)", "Aarav"),
        ("Last name", False, "Surname.", "Sharma"),
        ("Class", True, "The class this year, as in the Classes sheet: 8 or Class 8, LKG… (One \"Class & section\" column like 8-A also works instead of Class and Section.)", "Class 8"),
        ("Section", "If the class has sections", "The section this year.", "A"),
        ("Roll number", False, "1 to 999.", "12"),
        ("Date of birth", False, "DD/MM/YYYY.", "14/03/2015"),
        ("Gender", False, "M or F (Male, Female, Boy, Girl and Other also work).", "F"),
        ("Admission date", False, "When the student joined the school, DD/MM/YYYY.", "01/04/2020"),
        ("Blood group", False, "A+, A-, B+, B-, AB+, AB-, O+ or O-.", "B+"),
        ("Student phone", False, "The student's own mobile, for older students.", ""),
        ("Student email", False, "The student's own email.", ""),
        ("Address / City / State / PIN code", False, "Home address. PIN code is 6 digits.", "834001"),
        ("Father's name / Father's phone", "At least one parent phone", "A parent is added only when there's a phone number: that's how they sign in to the parent app and get messages.", "9000002001"),
        ("Mother's name / Mother's phone", False, "Same as above.", "9000002101"),
        ("Guardian name / Guardian phone", False, "For a student who lives with someone other than a parent.", ""),
        ("Parent email", False, "One email for the family.", ""),
    ], [SAVE, DATES, PHONES, "Two rows with the same admission number are flagged; a student already in Bastaa is skipped, never changed.",
        "Tick \"Invite parents to the parent app\" on upload to invite every parent with a phone number."])
    wb.save(OUT / "4-Students.xlsx")


# ------------------------------------------------------------------------------- 5. optional fees

def optional_fees():
    wb = Workbook()
    cols = [("Admission number", True, 16, True), ("Optional fees taken (Transport, Lab)", True, 34, True)]
    rows = [["1001", "Transport"], ["1003", "none"], ["1006", "Transport"], ["1007", "Transport, Computer Lab"], ["1012", "Computer Lab"], ["1015", "Transport"], ["1017", "Computer Lab"], ["1018", "Transport, Computer Lab"]]
    data_sheet(wb, "Optional fees", cols, rows)
    guide_sheet(wb, "Optional fees per student", COMMON + ["Upload after the fee structures are set up in Bastaa (Fees → Fee structures) with their optional fees, such as Transport or Computer Lab, and published."], [
        ("Admission number", True, "The student's admission number.", "1007"),
        ("Optional fees taken (Transport, Lab)", True, "The optional fees this student pays, separated by commas, exactly as they're named in the fee structure (or their short code). Write none for a student who takes none.", "Transport, Computer Lab"),
    ], [SAVE, "One row per student. A fee that isn't an optional fee in the student's class structure is flagged with the ones you can choose from."])
    wb.save(OUT / "5-Optional-fees.xlsx")


# ------------------------------------------------------------------------------- 6. fees already paid

def payments():
    wb = Workbook()
    cols = [("Admission number", True, 16, True), ("Amount paid (₹)", True, 16, False), ("Date paid", True, 13, True), ("Paid by (cash, UPI, bank, card)", False, 18, True), ("Old receipt no. / UTR", False, 22, True), ("Note", False, 28, True)]
    rows = [
        ["1001", 4000, "10/04/2026", "Cash", "R-0101", "Term 1"],
        ["1002", 6000, "12/04/2026", "UPI", "UTR 412233667788", "Term 1"],
        ["1006", 6000, "15/04/2026", "Cash", "R-0118", "Term 1"],
        ["1007", 3500, "20/04/2026", "Cheque", "CHQ 004512", "Term 1, part"],
        ["1007", 2500, "05/05/2026", "UPI", "UTR 512299001122", "Term 1, rest"],
        ["1010", 6000, "18/04/2026", "Bank", "NEFT N1180001", ""],
        ["1012", 6000, "02/05/2026", "Card", "POS 8812", ""],
        ["1015", 6000, "22/04/2026", "Cash", "R-0144", "Term 1"],
        ["1018", 3000, "09/07/2026", "UPI", "UTR 712200334455", ""],
    ]
    data_sheet(wb, "Fees already paid", cols, rows, {4: ["Cash", "UPI", "Bank", "Cheque", "Card"]})
    guide_sheet(wb, "Fees already paid this year", COMMON + [
        "For a school that starts on Bastaa in the middle of the year: the fees parents already paid this year, so dues are right from day one.",
        "Upload last, after Students, fee structures and Optional fees, and after the bills are made (Fees → Invoices → Generate). Needs permission to collect fees.",
    ], [
        ("Admission number", True, "The student's admission number.", "1007"),
        ("Amount paid (₹)", True, "The amount of this one payment. ₹, Rs. and commas are fine.", "6,000"),
        ("Date paid", True, "When it was paid, DD/MM/YYYY. Must be in this school year and not in the future.", "15/04/2026"),
        ("Paid by (cash, UPI, bank, card)", False, "Cash, UPI (GPay, PhonePe, Paytm), Bank (NEFT, RTGS, IMPS, cheque, DD) or Card. Blank means cash.", "UPI"),
        ("Old receipt no. / UTR", False, "The school's old receipt number, or the UPI / bank reference.", "R-0118"),
        ("Note", False, "Anything to remember about it.", "Term 1"),
    ], [SAVE, "One row per payment: a parent who paid twice has two rows.",
        "Each payment goes to the student's oldest unpaid bills first; anything more than what's due is kept as advance for later bills.",
        "Each payment gets a Bastaa receipt number; the old one is kept as its reference. Parents aren't messaged about old payments.",
        "The same payment (student, amount, date and reference) is never added twice, so uploading the file again is safe."])
    wb.save(OUT / "6-Fees-already-paid.xlsx")


# ------------------------------------------------------------------------------- 7. exam marks

def marks():
    wb = Workbook()
    cols = [("Admission no", False, 14, True), ("Roll no", False, 8, False), ("Student", False, 24, True), ("Marks (out of 50)", False, 18, True)]
    rows = [["1007", 12, "Rahul Mishra", "42"], ["1019", 13, "Tanvi Saxena", "47.5"], ["1020", 14, "Yash Malhotra", "A"]]
    ws = data_sheet(wb, "Marks", cols, rows)
    ws.cell(row=len(rows) + 3, column=1, value="Fill in marks out of 50. Use A for absent, E for exempt. Leave blank to keep a student as they are. Don't change the admission numbers.").font = NOTE_FONT
    guide_sheet(wb, "Exam marks (one class, one subject): sample for Class 8-A, Mathematics", [
        "Don't build this sheet by hand: in Bastaa open Examinations → the exam → Marks → choose the subject and section → Download sheet. It comes filled with the class list and any marks already entered.",
        "Fill in the Marks column and upload it on the same screen. Every row is checked; nothing is saved while any row has a problem.",
    ], [
        ("Admission no", True, "Leave as downloaded.", "1007"),
        ("Roll no / Student", False, "For your reference; not read.", "Rahul Mishra"),
        ("Marks (out of …)", True, "A number from 0 to the exam's maximum (up to 2 decimals), A for absent, E for exempt, or blank to leave unchanged.", "42"),
    ], ["This sample is for a 50-mark exam; the downloaded sheet shows the real maximum.", "Locked marks (published results) can't be changed by upload."])
    wb.save(OUT / "7-Exam-marks.xlsx")


# ------------------------------------------------------------------------------- 0. details typed into the setup wizard

def school_details():
    wb = Workbook()
    ws = wb.active
    ws.title = "Read me"
    lines = [
        ("Details to collect from the school", Font(bold=True, size=14, color=EMERALD)),
        ("These are NOT uploaded: the Bastaa team or the school office types them into the setup wizard (Settings). Collect them on the first call, together with sheets 1 to 6.", None),
        ("Order of work: 1) School profile and academic year  2) Upload Classes, Subjects, Teachers, Students  3) Fee heads and fee structures (this file)  4) Upload Optional fees  5) Generate the bills  6) Upload Fees already paid  7) Timetable and holidays (this file).", None),
    ]
    for r, (text, font) in enumerate(lines, start=1):
        cell = ws.cell(row=r, column=1, value=text)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        if font:
            cell.font = font
        ws.row_dimensions[r].height = 22 if font else 48
    ws.column_dimensions["A"].width = 110

    def table(title, header, rows, widths, note=None):
        sheet = wb.create_sheet(title)
        for c, (head, width) in enumerate(zip(header, widths), start=1):
            cell = sheet.cell(row=1, column=c, value=head)
            cell.font = HEAD_FONT
            cell.fill = HEAD_FILL
            cell.border = GRID
            cell.alignment = Alignment(wrap_text=True, vertical="center")
            sheet.column_dimensions[get_column_letter(c)].width = width
        for r, row in enumerate(rows, start=2):
            for c, value in enumerate(row, start=1):
                cell = sheet.cell(row=r, column=c, value=value)
                cell.border = GRID
                cell.alignment = Alignment(wrap_text=True, vertical="top")
        if note:
            sheet.cell(row=len(rows) + 3, column=1, value=note).font = NOTE_FONT
        sheet.freeze_panes = "A2"

    table("School profile", ["Detail", "Example", "School's answer"], [
        ["School name", "Green Valley Public School", ""], ["Board", "CBSE / ICSE / State board", ""], ["Affiliation number", "3430123", ""],
        ["Address", "Sector 4, Harmu Road", ""], ["City / State / PIN code", "Ranchi / Jharkhand / 834002", ""], ["Office phone", "0651 220 4410", ""],
        ["Office email", "office@school.in", ""], ["Web address wanted", "greenvalley (→ greenvalley.bastaa.in)", ""], ["School colour", "#0F5338", ""],
        ["Logo", "PNG or SVG, square, at least 512 px", ""], ["Principal's signature (for report cards and receipts)", "PNG on white", ""],
        ["Academic year", "2026–27, 01/04/2026 to 31/03/2027", ""], ["Weekly off", "Sunday (and 2nd Saturday?)", ""],
        ["School admin(s): name, mobile, email", "Anita Desai, 9000000001, office@school.in", ""],
        ["Accountant(s): name, mobile", "", ""], ["Receipt note (printed on every receipt)", "Fees once paid are not refundable.", ""],
    ], [44, 44, 40])
    table("Fee heads", ["Fee head", "Short code", "Type", "Recurring or one-time", "Optional? (only some students pay)"], [
        ["Tuition fee", "TUI", "Tuition", "Recurring", "No"], ["Admission fee", "ADM", "Admission", "One-time", "No"], ["Annual charges", "ANN", "Activity", "One-time", "No"],
        ["Exam fee", "EXM", "Exam", "Recurring", "No"], ["Transport", "TRN", "Transport", "Recurring", "Yes"], ["Computer Lab", "LAB", "Other", "Recurring", "Yes"],
    ], [22, 12, 14, 20, 30], "Type is one of: Tuition, Admission, Exam, Transport, Activity, Other. Optional heads are the ones listed in the Optional fees sheet.")
    table("Fee structure", ["Classes", "Fee head", "Amount for the year (₹)", "Paid in"], [
        ["Nursery – UKG", "Tuition fee", 24000, "Term 1, Term 2"], ["Nursery – UKG", "Annual charges", 3000, "Term 1"],
        ["Class 1 – 5", "Tuition fee", 30000, "Term 1, Term 2"], ["Class 1 – 5", "Annual charges", 4000, "Term 1"],
        ["Class 6 – 8", "Tuition fee", 36000, "Term 1, Term 2"], ["Class 6 – 10", "Exam fee", 2000, "Term 1, Term 2"],
        ["Class 9 – 10", "Tuition fee", 42000, "Term 1, Term 2"], ["All classes", "Transport (optional)", 18000, "Term 1, Term 2"],
        ["Class 3 – 10", "Computer Lab (optional)", 3000, "Term 1"],
    ], [18, 26, 22, 22], "One row per class group and fee head. Bastaa makes one structure per class group.")
    table("Installments", ["Installment", "Due date", "Share of the year", "Late fee (₹ or % and from when)"], [
        ["Term 1", "10/04/2026", "50%", "₹50 per week after 7 days"], ["Term 2", "10/10/2026", "50%", "₹50 per week after 7 days"],
    ], [16, 14, 18, 34], "Quarterly or monthly works too: one row per installment.")
    table("Concessions", ["Concession", "How much", "Who gets it"], [
        ["Sibling", "10% of tuition", "Second child onwards"], ["Staff ward", "50% of tuition", "Children of staff"], ["Merit", "₹5,000 a year", "Named students"],
    ], [18, 20, 30])
    table("Timetable periods", ["Period", "Starts", "Ends", "Break?"], [
        ["Assembly", "07:50", "08:00", "Yes"], ["P1", "08:00", "08:40", "No"], ["P2", "08:40", "09:20", "No"], ["P3", "09:20", "10:00", "No"], ["Break", "10:00", "10:20", "Yes"],
        ["P4", "10:20", "11:00", "No"], ["P5", "11:00", "11:40", "No"], ["Lunch", "11:40", "12:10", "Yes"], ["P6", "12:10", "12:50", "No"], ["P7", "12:50", "13:30", "No"],
    ], [14, 10, 10, 10], "24-hour times. Who teaches which subject in which class is set in Academics → Teaching assignments.")
    table("Holidays", ["Date (from)", "Date (to)", "Holiday"], [
        ["26/01/2027", "26/01/2027", "Republic Day"], ["14/03/2027", "14/03/2027", "Holi"], ["15/08/2026", "15/08/2026", "Independence Day"],
        ["20/10/2026", "24/10/2026", "Dussehra break"], ["08/11/2026", "10/11/2026", "Diwali"], ["25/12/2026", "31/12/2026", "Winter break"],
    ], [14, 14, 26])
    wb.save(OUT / "0-School-details-to-collect.xlsx")


if __name__ == "__main__":
    school_details()
    classes()
    subjects()
    teachers()
    students()
    optional_fees()
    payments()
    marks()
    print("Wrote:", ", ".join(sorted(p.name for p in OUT.glob("*.xlsx"))))
