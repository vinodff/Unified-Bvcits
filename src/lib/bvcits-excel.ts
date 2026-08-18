// Real Excel (.xlsx) File Generator and Appointment Data Store
// Powered by SheetJS (xlsx) for BVCITS College Administration


export interface StoredAppointment {
  token: string;
  studentName: string;
  mobileNumber: string;
  department: string;
  hodName: string;
  date: string;
  slot: string;
  purpose: string;
  status: "Confirmed" | "Completed" | "Pending";
  bookedAt: string;
}

const STORAGE_KEY = "bvcits_appointments_ledger_2026";

// Initial seed appointments so college staff can immediately test Excel export
const SEED_APPOINTMENTS: StoredAppointment[] = [
  {
    token: "BVTS-APT-4821",
    studentName: "M. Sai Tarun",
    mobileNumber: "9848022338",
    department: "Computer Science & Engineering (CSE)",
    hodName: "Dr. K. Srinivasa Rao",
    date: "Tomorrow (రేపు)",
    slot: "10:30 AM",
    purpose: "Admissions & Fee Enquiry (అడ్మిషన్ & ఫీజుల వివరాలు)",
    status: "Confirmed",
    bookedAt: new Date(Date.now() - 3600000 * 4).toLocaleString(),
  },
  {
    token: "BVTS-APT-7913",
    studentName: "K. Bhavani Shankar",
    mobileNumber: "9440188992",
    department: "Artificial Intelligence & Data Science (AI & DS)",
    hodName: "Dr. M. Ravi Kumar",
    date: "Tomorrow (రేపు)",
    slot: "11:45 AM",
    purpose: "Course Curriculum & Labs (సిలబస్ & ల్యాబ్స్ వివరాలు)",
    status: "Confirmed",
    bookedAt: new Date(Date.now() - 3600000 * 2).toLocaleString(),
  },
  {
    token: "BVTS-APT-2305",
    studentName: "V. Lakshmi Prasanna",
    mobileNumber: "8978123450",
    department: "Computer Science & Engineering (CSE)",
    hodName: "Dr. K. Srinivasa Rao",
    date: "Day After (ఎల్లుండి)",
    slot: "02:15 PM",
    purpose: "Hostel & Bus Facilities (హాస్టల్ & బస్సు సౌకర్యాలు)",
    status: "Confirmed",
    bookedAt: new Date(Date.now() - 3600000 * 1).toLocaleString(),
  },
];

export function getStoredAppointments(): StoredAppointment[] {
  if (typeof window === "undefined") return SEED_APPOINTMENTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_APPOINTMENTS));
      return SEED_APPOINTMENTS;
    }
    return JSON.parse(raw);
  } catch {
    return SEED_APPOINTMENTS;
  }
}

export function saveAppointment(appointment: StoredAppointment): void {
  if (typeof window === "undefined") return;
  try {
    const list = getStoredAppointments();
    // Add new appointment to top of list
    const updated = [appointment, ...list.filter((a) => a.token !== appointment.token)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save appointment:", err);
  }
}

export async function exportAppointmentsToExcel(appointments?: StoredAppointment[]): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const XLSX = await import("xlsx");
    const dataToExport = appointments || getStoredAppointments();

    // Map to formatted readable columns for Excel
    const excelRows = dataToExport.map((a, index) => ({
      "S.No": index + 1,
      "Appointment Token ID": a.token,
      "Student / Parent Name": a.studentName,
      "Mobile Number": a.mobileNumber,
      "Department": a.department,
      "HOD / Officer Assigned": a.hodName,
      "Scheduled Date": a.date,
      "Time Slot": a.slot,
      "Enquiry Purpose": a.purpose,
      "Booking Status": a.status,
      "Booked Timestamp": a.bookedAt,
    }));

    // Create Worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Set Column Widths for clean viewing in Microsoft Excel
    worksheet["!cols"] = [
      { wch: 6 },  // S.No
      { wch: 22 }, // Token ID
      { wch: 24 }, // Student Name
      { wch: 16 }, // Mobile Number
      { wch: 38 }, // Department
      { wch: 26 }, // HOD Name
      { wch: 18 }, // Date
      { wch: 14 }, // Time Slot
      { wch: 35 }, // Purpose
      { wch: 14 }, // Status
      { wch: 22 }, // Timestamp
    ];

    // Create Workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BVCITS Appointments");

    // Write and trigger download
    const fileName = `BVCITS_Student_Appointments_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    return true;
  } catch (err) {
    console.error("Failed to export Excel file:", err);
    return false;
  }
}

