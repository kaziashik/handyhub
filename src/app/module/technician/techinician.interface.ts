import { TechinicianVerificationStatus } from "../../../generated/prisma/enums";

export interface IApplyAsTechnicianPayload {
  user: {
    name: string;
    email: string;
  };

  technician: {
    address?: string;
    specialization: string;
    licenseNumber: string;
    qualifications: string;
    experienceYears: number;
    bio?: string;
    consultationFee?: number;
    contactNumber?: string;
  };
}


export interface IVerifyTechinicianEmailPayload {
    email: string;
    otp: string;
}


export interface IApproveTechinicianPayload {
    techinicianId: string;
    verificationStatus: TechinicianVerificationStatus;
    rejectionReason: string;
}