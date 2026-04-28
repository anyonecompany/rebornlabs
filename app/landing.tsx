"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";

const PRETENDARD_URL = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";
const CONSULTATION_API_URL = "https://rebornlabs-admin.vercel.app/api/consultations/submit";

export default function RebornLabsLanding() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    vehicle: "",
    message: "",
  });
  const [utmSource, setUtmSource] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [visibleSections, setVisibleSections] = useState(new Set<string>());
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramRef = params.get("ref") || params.get("utm_source");

    if (paramRef) {
      sessionStorage.setItem("reborn_ref", paramRef);
      setUtmSource(paramRef);
    } else {
      const stored = sessionStorage.getItem("reborn_ref");
      setUtmSource(stored || "direct");
    }

    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set([...prev, entry.target.id]));
          }
        });
      },
      { threshold: 0.15 }
    );

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const registerRef = (id: string) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  };

  const isVisible = (id: string) => visibleSections.has(id);

  const handleSubmit = async () => {
    if (!formData.name || !formData.phone) return;
    setSubmitting(true);

    const payload = {
      name: formData.name,
      phone: formData.phone,
      vehicle: formData.vehicle,
      message: formData.message,
      ref: utmSource,
    };

    try {
      const res = await fetch(CONSULTATION_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, website: "" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? "신청 중 오류가 발생했습니다. 다시 시도해주세요.");
        return;
      }
      setSubmitted(true);
    } catch {
      alert("신청 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  const vehicles = [
    { name: "Mercedes-Benz E300", deposit: "800만원", monthly: "50만원대", img: "/vehicle-45.webp" },
    { name: "Porsche 718 Boxster", deposit: "1,000만원", monthly: "120만원대", img: "/vehicle-46.webp" },
    { name: "Range Rover Evoque", deposit: "1,000만원", monthly: "70만원대", img: "/vehicle-47.webp" },
    { name: "Range Rover Vogue", deposit: "1,400만원", monthly: "110만원대", img: "/vehicle-48.webp" },
    { name: "Audi New A7", deposit: "1,000만원", monthly: "90만원대", img: "/vehicle-49.webp" },
    { name: "Maybach S560", deposit: "1,500만원", monthly: "100만원대", img: "/vehicle-50.webp" },
    { name: "BMW 525d", deposit: "1,000만원", monthly: "60만원대", img: "/vehicle-51.webp" },
  ];

  const navItems = [
    { label: "회사소개", id: "about" },
    { label: "사업구조", id: "structure" },
    { label: "시장현황", id: "market" },
    { label: "상품안내", id: "product" },
    { label: "차량라인업", id: "lineup" },
    { label: "상담신청", id: "contact" },
  ];

  return (
    <>
      <style>{`
        @import url('${PRETENDARD_URL}');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          font-family: 'Pretendard Variable', 'Pretendard', -apple-system, sans-serif;
          font-weight: 400;
          color: #fff;
          background: #000;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

        /* Animations */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .fade-up {
          opacity: 0;
          transform: translateY(40px);
          transition: opacity 0.8s ease, transform 0.8s ease;
        }
        .fade-up.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .mobile-br { display: none; }
        .hero-bg-desktop { display: block; }
        .hero-bg-mobile { display: none; }

        .fade-up-d1 { transition-delay: 0.1s; }
        .fade-up-d2 { transition-delay: 0.2s; }
        .fade-up-d3 { transition-delay: 0.3s; }
        .fade-up-d4 { transition-delay: 0.4s; }
        .fade-up-d5 { transition-delay: 0.5s; }
        .fade-up-d6 { transition-delay: 0.6s; }
        .fade-up-d7 { transition-delay: 0.7s; }

        /* Navigation */
        .nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          transition: background 0.3s ease, backdrop-filter 0.3s ease;
          padding: 0 40px;
        }
        .nav.scrolled {
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .nav-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 72px;
        }
        .nav-logo {
          font-weight: 600;
          font-size: 18px;
          letter-spacing: 3px;
          cursor: pointer;
        }
        .nav-links {
          display: flex;
          gap: 36px;
        }
        .nav-link {
          font-size: 14px;
          font-weight: 400;
          color: #c8bfa8;
          cursor: pointer;
          transition: color 0.2s;
          letter-spacing: -0.2px;
        }
        .nav-link:hover {
          color: #fff;
        }
        .mobile-menu-btn {
          display: none;
          background: none;
          border: none;
          color: #fff;
          cursor: pointer;
          padding: 8px;
        }
        .mobile-menu {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.97);
          z-index: 99;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 32px;
          animation: fadeIn 0.3s ease;
        }
        .mobile-menu.open {
          display: flex;
        }
        .mobile-menu-link {
          font-size: 20px;
          font-weight: 400;
          color: rgba(255,255,255,0.8);
          cursor: pointer;
          transition: color 0.2s;
        }
        .mobile-menu-close {
          position: absolute;
          top: 24px;
          right: 24px;
          background: none;
          border: none;
          color: #fff;
          font-size: 28px;
          cursor: pointer;
        }

        /* Hero */
        .hero {
          position: relative;
          height: 100vh;
          min-height: 600px;
          display: flex;
          align-items: flex-end;
          padding: 0 40px 100px;
          overflow: hidden;
        }
        .hero-bg {
          position: absolute;
          inset: 0;
        }
        .hero-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(0,0,0,0.25) 0%,
            rgba(0,0,0,0.4) 40%,
            rgba(0,0,0,0.75) 100%
          );
        }
        .hero-content {
          position: relative;
          z-index: 2;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          animation: fadeUp 1s ease 0.3s both;
        }
        .hero-sub {
          font-size: 15.5px;
          font-weight: 400;
          color: #c8bfa8;
          letter-spacing: 4px;
          text-transform: uppercase;
          margin-bottom: 24px;
        }
        .hero-anchor {
          font-size: 24px;
          font-weight: 600;
          color: #fff;
          margin-bottom: 10px;
          line-height: 1.5;
        }
        .hero-anchor-strike {
          text-decoration: none;
          background: none;
          color: #fff;
          font-weight: 700;
        }
        .hero-title {
          font-size: 50px;
          font-weight: 700;
          line-height: 1.3;
          letter-spacing: -1px;
          margin-bottom: 12px;
        }
        .hero-price {
          font-size: 56px;
          font-weight: 700;
          letter-spacing: -1.5px;
          line-height: 1.2;
          margin-bottom: 20px;
        }
        .hero-price-highlight {
          color: #fff;
        }
        .hero-desc {
          font-size: 17.5px;
          font-weight: 400;
          color: #d4cbba;
          line-height: 1.7;
          max-width: 520px;
          margin-bottom: 36px;
        }
        .hero-mini-form {
          display: flex;
          gap: 12px;
          max-width: 680px;
        }
        .hero-mini-input {
          flex: 1;
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          color: #fff;
          font-family: inherit;
          font-size: 15.5px;
          font-weight: 400;
          padding: 16px 20px;
          outline: none;
          transition: border-color 0.2s;
        }
        .hero-mini-input:focus {
          border-color: rgba(255,255,255,0.35);
        }
        .hero-mini-input::placeholder {
          color: rgba(255,255,255,0.35);
        }
        .hero-mini-input option {
          background: #111;
          color: #fff;
        }
        select.hero-mini-input {
          padding-right: 36px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none'%3E%3Cpath d='M1 1.5l5 5 5-5' stroke='rgba(255,255,255,0.4)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
        }
        .hero-mini-submit {
          padding: 16px 32px;
          background: #fff;
          color: #000;
          font-size: 15.5px;
          font-weight: 700;
          font-family: inherit;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          letter-spacing: -0.3px;
          transition: background 0.2s;
          white-space: nowrap;
        }
        .hero-mini-submit:hover {
          background: #e8dcc8;
        }
        .hero-mini-submit:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .hero-cta {
          margin-top: 36px;
          display: inline-block;
          padding: 16px 40px;
          background: #fff;
          color: #000;
          font-size: 16.5px;
          font-weight: 600;
          font-family: inherit;
          border: none;
          cursor: pointer;
          letter-spacing: -0.3px;
          transition: opacity 0.2s;
        }
        .hero-cta:hover {
          opacity: 0.85;
        }

        /* Section base */
        .section {
          padding: 140px 40px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .section-dark {
          background: #000;
        }
        .section-label {
          font-size: 13.5px;
          font-weight: 400;
          color: #a09880;
          letter-spacing: 4px;
          text-transform: uppercase;
          margin-bottom: 16px;
        }
        .section-title {
          font-size: 38px;
          font-weight: 600;
          line-height: 1.35;
          letter-spacing: -0.5px;
          margin-bottom: 20px;
        }
        .section-desc {
          font-size: 17.5px;
          font-weight: 400;
          color: #b0a890;
          line-height: 1.75;
          max-width: 560px;
        }
        .divider {
          width: 40px;
          height: 1px;
          background: rgba(255,255,255,0.2);
          margin: 24px 0;
        }

        /* Full width image section */
        .full-image-section {
          position: relative;
          padding: 160px 40px;
          overflow: hidden;
        }
        .full-image-bg {
          position: absolute;
          inset: 0;
          background: #080808;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .full-image-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.65);
        }
        .full-image-content {
          position: relative;
          z-index: 2;
          max-width: 1200px;
          margin: 0 auto;
        }

        /* Gradient label mixin */
        .grad-label {
          font-size: 15.5px;
          font-weight: 600;
          letter-spacing: 1px;
          margin-bottom: 28px;
          background: linear-gradient(135deg, #8a7e68 0%, #d4cbba 50%, #8a7e68 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          display: block;
        }

        /* About */
        .about-section {
          padding: 140px 40px;
          background: #000;
          text-align: center;
        }
        .about-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .about-heading {
          font-size: 44px;
          font-weight: 700;
          line-height: 1.4;
          letter-spacing: -1px;
          margin-bottom: 32px;
        }
        .about-sub {
          font-size: 16.5px;
          font-weight: 400;
          color: #b0a890;
          line-height: 1.8;
          max-width: 520px;
          margin: 0 auto;
        }
        .about-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 64px;
        }
        .about-card {
          background: linear-gradient(145deg, #1a1a1a 0%, #111 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 40px 36px;
          text-align: left;
        }
        .about-card-label {
          font-size: 15.5px;
          font-weight: 400;
          color: #b0a890;
          line-height: 1.6;
          margin-bottom: 24px;
        }
        .about-card-number {
          font-size: 46px;
          font-weight: 700;
          letter-spacing: -2px;
          line-height: 1;
          color: #fff;
        }
        .about-cta-wrap {
          margin-top: 48px;
        }
        .about-cta {
          display: inline-block;
          padding: 15px 38px;
          background: transparent;
          color: #fff;
          font-family: inherit;
          font-size: 15.5px;
          font-weight: 500;
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: 30px;
          cursor: pointer;
          letter-spacing: -0.2px;
          transition: background 0.2s, border-color 0.2s;
        }
        .about-cta:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.4);
        }

        /* Structure */
        .structure-section {
          position: relative;
          padding: 160px 40px;
          overflow: hidden;
        }
        .structure-bg {
          position: absolute;
          inset: 0;
        }
        .structure-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.78);
        }
        .structure-inner {
          position: relative;
          z-index: 2;
          max-width: 1200px;
          margin: 0 auto;
        }
        .structure-header {
          text-align: center;
          margin-bottom: 72px;
        }
        .structure-heading {
          font-size: 44px;
          font-weight: 700;
          line-height: 1.4;
          letter-spacing: -1px;
          margin-bottom: 24px;
        }
        .structure-sub {
          font-size: 16.5px;
          font-weight: 400;
          color: #b0a890;
          line-height: 1.8;
          max-width: 480px;
          margin: 0 auto;
        }
        .structure-timeline {
          max-width: 800px;
          margin: 0 auto;
          position: relative;
        }
        .structure-timeline::before {
          content: '';
          position: absolute;
          left: 4px;
          top: -28px;
          bottom: -28px;
          width: 1px;
          background: linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.12) 10%, rgba(255,255,255,0.12) 90%, transparent 100%);
        }
        .structure-step {
          position: relative;
          padding: 0 0 72px 48px;
        }
        .structure-step:last-child {
          padding-bottom: 0;
        }
        .structure-step::before {
          content: '';
          position: absolute;
          left: 1px;
          top: 3px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #b0a890;
        }
        .structure-step-num {
          font-size: 12px;
          font-weight: 500;
          color: #a09880;
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .structure-step-title {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 14px;
          letter-spacing: -0.5px;
          line-height: 1.3;
        }
        .structure-step-desc {
          font-size: 15.5px;
          font-weight: 400;
          color: #b0a890;
          line-height: 1.85;
        }

        /* Market */
        .market-section {
          padding: 140px 40px 160px;
          background: #000;
        }
        .market-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .market-header {
          text-align: center;
          margin-bottom: 100px;
        }
        .market-heading {
          font-size: 44px;
          font-weight: 700;
          line-height: 1.4;
          letter-spacing: -1px;
          margin-bottom: 28px;
        }
        .market-desc {
          font-size: 16.5px;
          font-weight: 400;
          color: #b0a890;
          line-height: 1.9;
          max-width: 540px;
          margin: 0 auto;
        }
        .market-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        .market-stat-card {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 44px 36px;
          position: relative;
          overflow: hidden;
        }
        .market-stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%);
        }
        .market-stat-eyebrow {
          font-size: 13px;
          font-weight: 500;
          color: #a09880;
          letter-spacing: 1px;
          margin-bottom: 32px;
        }
        .market-stat-number {
          font-size: 56px;
          font-weight: 700;
          letter-spacing: 0px;
          margin-bottom: 4px;
          line-height: 1;
        }
        .market-stat-unit {
          font-size: 21.5px;
          font-weight: 400;
          color: #c8bfa8;
          margin-left: 2px;
        }
        .market-stat-label {
          font-size: 15px;
          font-weight: 400;
          color: #b0a890;
          line-height: 1.7;
          margin-top: 20px;
        }
        .market-bottom {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px;
          align-items: center;
          margin-top: 100px;
        }
        .market-bottom-text p {
          font-size: 16.5px;
          font-weight: 400;
          color: #b0a890;
          line-height: 2;
        }
        .market-bottom-image {
          background: linear-gradient(145deg, #1a1a1a 0%, #111 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          aspect-ratio: 4/3;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .market-bottom-placeholder {
          font-size: 14px;
          color: rgba(255,255,255,0.15);
          text-align: center;
          line-height: 1.8;
        }

        /* Quote highlight */
        .quote-band {
          position: relative;
          padding: 160px 40px;
          background: #f2f0eb;
          text-align: center;
          overflow: hidden;
        }
        .quote-inner {
          position: relative;
          z-index: 2;
          max-width: 900px;
          margin: 0 auto;
        }
        .quote-text {
          font-size: 52px;
          font-weight: 700;
          letter-spacing: -1.5px;
          line-height: 1.4;
          color: #111;
        }
        .quote-line {
          width: 48px;
          height: 1px;
          background: rgba(0,0,0,0.15);
          margin: 40px auto;
        }
        .quote-sub {
          font-size: 17.5px;
          font-weight: 400;
          color: rgba(0,0,0,0.45);
          line-height: 1.8;
        }
        .quote-highlight {
          background: #3a3630;
          color: #e8dcc8;
          font-weight: 600;
          padding: 1px 1px;
        }

        /* Product */
        .product-section {
          padding: 140px 40px 0;
          background: #000;
        }
        .product-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .product-header {
          text-align: center;
          margin-bottom: 80px;
        }
        .product-heading {
          font-size: 44px;
          font-weight: 700;
          line-height: 1.4;
          letter-spacing: -1px;
        }
        .product-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px;
          align-items: center;
          padding: 100px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .product-row:last-child {
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .product-row.reverse .product-text {
          order: 2;
        }
        .product-row.reverse .product-illust {
          order: 1;
        }
        .product-text-title {
          font-size: 36px;
          font-weight: 700;
          line-height: 1.4;
          letter-spacing: -0.5px;
          margin-bottom: 24px;
        }
        .product-text-desc {
          font-size: 16.5px;
          font-weight: 400;
          color: #b0a890;
          line-height: 1.8;
        }
        .product-illust-box {
          width: 100%;
          aspect-ratio: 1 / 1;
          background: linear-gradient(145deg, #1a1a1a 0%, #111 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }
        .product-illust-placeholder {
          font-size: 14px;
          color: rgba(255,255,255,0.2);
          text-align: center;
          line-height: 1.8;
        }

        /* Vehicle lineup */
        .lineup-wrapper {
          background: #f2f0eb;
          border-radius: 32px 32px 0 0;
          padding: 120px 40px 60px;
        }
        .lineup-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .lineup-label {
          font-size: 13.5px;
          font-weight: 400;
          color: rgba(0,0,0,0.35);
          letter-spacing: 4px;
          text-transform: uppercase;
          margin-bottom: 16px;
        }
        .lineup-title {
          font-size: 38px;
          font-weight: 600;
          line-height: 1.35;
          letter-spacing: -0.5px;
          margin-bottom: 20px;
          color: #111;
        }
        .lineup-desc {
          font-size: 17.5px;
          font-weight: 400;
          color: rgba(0,0,0,0.45);
          line-height: 1.75;
          max-width: 560px;
        }
        .vehicle-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          margin-top: 60px;
        }
        .vehicle-card {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 16px;
          overflow: hidden;
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .vehicle-card:hover {
          border-color: rgba(0,0,0,0.12);
          box-shadow: 0 8px 32px rgba(0,0,0,0.08);
        }
        .vehicle-image {
          width: 100%;
          aspect-ratio: 16/10;
          background: #f5f5f3;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .vehicle-image-label {
          font-size: 12px;
          color: #bbb;
          font-weight: 400;
          text-align: center;
          line-height: 1.6;
        }
        .vehicle-info {
          padding: 28px 28px 32px;
        }
        .vehicle-name {
          font-size: 19.5px;
          font-weight: 600;
          letter-spacing: -0.3px;
          margin-bottom: 20px;
          color: #111;
        }
        .vehicle-detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid rgba(0,0,0,0.06);
        }
        .vehicle-detail-row:last-child {
          border-bottom: none;
        }
        .vehicle-detail-label {
          font-size: 14.5px;
          font-weight: 400;
          color: rgba(0,0,0,0.4);
        }
        .vehicle-detail-value {
          font-size: 16.5px;
          font-weight: 600;
          color: #111;
        }

        /* Contact form (inside lineup) */
        .contact-box {
          background: #111;
          border-radius: 24px;
          padding: 100px 40px;
          margin-top: 80px;
        }
        .contact-content {
          max-width: 600px;
          margin: 0 auto;
        }
        .form-group {
          margin-bottom: 24px;
        }
        .form-label {
          font-size: 13.5px;
          font-weight: 400;
          color: #a09880;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 10px;
          display: block;
        }
        .form-input,
        .form-select,
        .form-textarea {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(255,255,255,0.15);
          color: #fff;
          font-family: inherit;
          font-size: 17.5px;
          font-weight: 400;
          padding: 12px 0;
          outline: none;
          transition: border-color 0.2s;
          border-radius: 0;
          -webkit-appearance: none;
        }
        .form-input:focus,
        .form-select:focus,
        .form-textarea:focus {
          border-bottom-color: rgba(255,255,255,0.5);
        }
        .form-input::placeholder,
        .form-textarea::placeholder {
          color: #7a7260;
        }
        .form-select {
          cursor: pointer;
        }
        .form-select option {
          background: #111;
          color: #fff;
        }
        .form-textarea {
          resize: vertical;
          min-height: 100px;
        }
        .form-submit {
          width: 100%;
          padding: 18px;
          background: #fff;
          color: #000;
          font-family: inherit;
          font-size: 16.5px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          letter-spacing: -0.3px;
          margin-top: 20px;
          transition: opacity 0.2s;
        }
        .form-submit:hover {
          opacity: 0.85;
        }
        .form-submit:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .success-message {
          text-align: center;
          padding: 60px 0;
        }
        .success-title {
          font-size: 30px;
          font-weight: 600;
          margin-bottom: 16px;
          letter-spacing: -0.5px;
        }
        .success-desc {
          font-size: 16.5px;
          font-weight: 400;
          color: #b0a890;
          line-height: 1.7;
        }

        /* Footer */
        .footer {
          padding: 60px 40px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .footer-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .footer-logo {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 3px;
          margin-bottom: 24px;
        }
        .footer-info {
          font-size: 13px;
          font-weight: 400;
          color: #a09880;
          line-height: 1.8;
        }
        .footer-tel {
          color: #c8bfa8;
          text-decoration: none;
          border-bottom: 1px solid rgba(200, 191, 168, 0.3);
        }
        .footer-tel:hover { color: #fff; }
        .footer-copy {
          margin-top: 40px;
          font-size: 12px;
          color: #7a7260;
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          .nav { padding: 0 20px; }
          .nav-inner { height: 60px; }
          .nav-links { display: none; }
          .mobile-menu-btn { display: block; }

          .hero {
            padding: 0 20px 80px;
            min-height: 100vh;
            min-height: 100svh;
          }
          .hero-sub { font-size: 11px; letter-spacing: 3px; }
          .hero-anchor { font-size: 16px; }
          .hero-title { font-size: 24px; letter-spacing: -0.5px; }
          .hero-price { font-size: 36px; }
          .mobile-br { display: block; }
          .hero-bg-desktop { display: none; }
          .hero-bg-mobile { display: block; }
          .hero-desc { font-size: 14px; }
          .hero-mini-form {
            flex-direction: column;
            gap: 10px;
            max-width: 100%;
          }
          .hero-mini-input { padding: 14px 16px; font-size: 14px; }
          .hero-mini-submit { padding: 14px 24px; font-size: 14px; }
          .hero-cta { padding: 14px 32px; font-size: 14px; }

          .section { padding: 80px 20px; }
          .section-label { font-size: 11px; letter-spacing: 3px; }
          .section-title { font-size: 24px; }
          .section-desc { font-size: 14px; }

          .about-section { padding: 80px 20px; }
          .about-heading { font-size: 26px; }
          .about-sub { font-size: 13px; }
          .about-cards {
            grid-template-columns: 1fr;
            gap: 12px;
            margin-top: 40px;
          }
          .about-card { padding: 32px 28px; }
          .about-card-number { font-size: 36px; }

          .full-image-section { padding: 100px 20px; }

          .structure-section { padding: 100px 20px; }
          .structure-heading { font-size: 28px; }
          .structure-header { margin-bottom: 48px; }
          .structure-step { padding: 0 0 48px 40px; }
          .structure-step-title { font-size: 20px; }
          .structure-step-desc { font-size: 14px; }

          .market-section { padding: 80px 20px 100px; }
          .market-heading { font-size: 28px; }
          .market-header { margin-bottom: 48px; }
          .market-stats {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .market-stat-card { padding: 32px 28px; }
          .market-stat-number { font-size: 40px; }
          .market-bottom {
            grid-template-columns: 1fr;
            gap: 40px;
            margin-top: 60px;
            text-align: center;
          }
          .quote-band { padding: 80px 20px; }
          .quote-text { font-size: 30px; }
          .quote-sub { font-size: 14px; }

          .product-section { padding: 80px 20px 0; }
          .product-heading { font-size: 26px; }
          .product-header { margin-bottom: 60px; }
          .product-row {
            grid-template-columns: 1fr;
            gap: 40px;
            padding: 60px 0;
          }
          .product-row.reverse .product-text { order: 1; }
          .product-row.reverse .product-illust { order: 2; }
          .product-text-title { font-size: 24px; }
          .product-text-desc { font-size: 14px; }
          .product-illust-box { aspect-ratio: 4/3; }

          .lineup-wrapper {
            border-radius: 24px 24px 0 0;
            padding: 80px 20px 40px;
          }
          .lineup-title { font-size: 24px; }
          .lineup-desc { font-size: 14px; }
          .vehicle-grid {
            grid-template-columns: 1fr;
            gap: 16px;
            margin-top: 40px;
          }
          .vehicle-info { padding: 20px 20px 24px; }
          .vehicle-name { font-size: 16px; }

          .contact-box {
            border-radius: 16px;
            padding: 60px 20px;
            margin-top: 48px;
          }
          .contact-content { max-width: 100%; }

          .footer { padding: 48px 20px; }
        }
      `}</style>

      {/* Navigation */}
      <nav className={`nav ${scrollY > 50 ? "scrolled" : ""}`}>
        <div className="nav-inner">
          <div className="nav-logo" onClick={() => scrollTo("hero")}>
            REBORN LABS
          </div>
          <div className="nav-links">
            {navItems.map((item) => (
              <span
                key={item.id}
                className="nav-link"
                onClick={() => scrollTo(item.id)}
              >
                {item.label}
              </span>
            ))}
          </div>
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 7h18M3 12h18M3 17h18" stroke="#fff" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div className={`mobile-menu ${mobileMenuOpen ? "open" : ""}`}>
        <button
          className="mobile-menu-close"
          onClick={() => setMobileMenuOpen(false)}
        >
          ✕
        </button>
        {navItems.map((item) => (
          <span
            key={item.id}
            className="mobile-menu-link"
            onClick={() => scrollTo(item.id)}
          >
            {item.label}
          </span>
        ))}
      </div>

      {/* Hero */}
      <section className="hero" id="hero">
        <div className="hero-bg">
          <Image
            className="hero-bg-desktop"
            src="/hero-bg.webp"
            alt="프리미엄 차량 배경"
            fill
            priority
            quality={100}
            style={{ objectFit: "cover", objectPosition: "center" }}
            unoptimized
          />
          <Image
            className="hero-bg-mobile"
            src="/hero-bg-mobile.webp"
            alt="프리미엄 차량 배경 모바일"
            fill
            priority
            quality={100}
            style={{ objectFit: "cover", objectPosition: "center" }}
            unoptimized
          />
        </div>
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="hero-anchor">
            벤츠 E300, 월 리스료 <span className="hero-anchor-strike">120만원</span>?
          </p>
          <h1 className="hero-title">
            여기선 <span className="hero-price-highlight">월 50만원대.</span>
          </h1>
          <p className="hero-desc">
            완벽히 복원된 프리미엄 차량을 합리적인 비용으로.
            <br />
            36개월 이용 후 반납하는 새로운 카 라이프를 경험하세요.
          </p>
          <div className="hero-mini-form">
            <input
              className="hero-mini-input"
              type="text"
              placeholder="이름"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <input
              className="hero-mini-input"
              type="tel"
              placeholder="연락처"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
            <select
              className="hero-mini-input"
              value={formData.vehicle}
              onChange={(e) => setFormData({ ...formData, vehicle: e.target.value })}
            >
              <option value="">현재 출고 가능 차량</option>
              <option disabled>── 현대 ──</option>
              <option value="현대 그랜저">현대 그랜저</option>
              <option value="현대 싼타페">현대 싼타페</option>
              <option value="현대 펠리세이드">현대 펠리세이드</option>
              <option value="현대 아이오닉6">현대 아이오닉6</option>
              <option disabled>── 제네시스 ──</option>
              <option value="제네시스 G70">제네시스 G70</option>
              <option value="제네시스 G80">제네시스 G80</option>
              <option value="제네시스 EQ900">제네시스 EQ900</option>
              <option value="제네시스 GV70">제네시스 GV70</option>
              <option value="제네시스 GV80">제네시스 GV80</option>
              <option disabled>── BMW ──</option>
              <option value="BMW 3시리즈">BMW 3시리즈</option>
              <option value="BMW 5시리즈">BMW 5시리즈</option>
              <option value="BMW 7시리즈">BMW 7시리즈</option>
              <option value="BMW 8시리즈">BMW 8시리즈</option>
              <option value="BMW X3">BMW X3</option>
              <option value="BMW X5">BMW X5</option>
              <option value="BMW X6">BMW X6</option>
              <option value="BMW X7">BMW X7</option>
              <option disabled>── 랜드로버 ──</option>
              <option value="랜드로버 디스커버리 스포츠">랜드로버 디스커버리 스포츠</option>
              <option value="랜드로버 디스커버리">랜드로버 디스커버리</option>
              <option value="랜드로버 디펜더">랜드로버 디펜더</option>
              <option value="랜드로버 레인지로버 벨라">랜드로버 레인지로버 벨라</option>
              <option value="랜드로버 레인지로버 스포츠">랜드로버 레인지로버 스포츠</option>
              <option value="랜드로버 레인지로버 이보크">랜드로버 레인지로버 이보크</option>
              <option value="랜드로버 레인지로버">랜드로버 레인지로버</option>
              <option disabled>── 마세라티 ──</option>
              <option value="마세라티 르반떼">마세라티 르반떼</option>
              <option value="마세라티 기블리">마세라티 기블리</option>
              <option value="마세라티 콰트로포르테">마세라티 콰트로포르테</option>
              <option value="마세라티 그란투리스모">마세라티 그란투리스모</option>
              <option value="마세라티 그란카브리오">마세라티 그란카브리오</option>
              <option disabled>── 마이바흐 ──</option>
              <option value="마이바흐 57">마이바흐 57</option>
              <option value="마이바흐 57S">마이바흐 57S</option>
              <option value="마이바흐 62">마이바흐 62</option>
              <option value="마이바흐 62S">마이바흐 62S</option>
              <option value="마이바흐 57제플린">마이바흐 57제플린</option>
              <option value="마이바흐 62제플린">마이바흐 62제플린</option>
              <option value="마이바흐 62S렌들렛">마이바흐 62S렌들렛</option>
              <option disabled>── 벤츠 ──</option>
              <option value="벤츠 C-클래스">벤츠 C-클래스</option>
              <option value="벤츠 E-클래스">벤츠 E-클래스</option>
              <option value="벤츠 S-클래스">벤츠 S-클래스</option>
              <option value="벤츠 CLS-클래스">벤츠 CLS-클래스</option>
              <option value="벤츠 GLC-클래스">벤츠 GLC-클래스</option>
              <option value="벤츠 GLE-클래스">벤츠 GLE-클래스</option>
              <option disabled>── 아우디 ──</option>
              <option value="아우디 A4">아우디 A4</option>
              <option value="아우디 A5">아우디 A5</option>
              <option value="아우디 A6">아우디 A6</option>
              <option value="아우디 A7">아우디 A7</option>
              <option value="아우디 Q5">아우디 Q5</option>
              <option value="아우디 Q7">아우디 Q7</option>
              <option disabled>── 지프 ──</option>
              <option value="지프 글래디에이터">지프 글래디에이터</option>
              <option value="지프 랭글러">지프 랭글러</option>
              <option value="지프 레니게이드">지프 레니게이드</option>
              <option value="지프 체로키">지프 체로키</option>
              <option disabled>── 재규어 ──</option>
              <option value="재규어 XF">재규어 XF</option>
              <option value="재규어 F-TYPE">재규어 F-TYPE</option>
              <option value="재규어 F-PACE">재규어 F-PACE</option>
              <option value="재규어 XE">재규어 XE</option>
              <option disabled>── 테슬라 ──</option>
              <option value="테슬라 모델3">테슬라 모델3</option>
              <option value="테슬라 모델S">테슬라 모델S</option>
              <option value="테슬라 모델X">테슬라 모델X</option>
              <option value="테슬라 모델Y">테슬라 모델Y</option>
              <option disabled>── 포르쉐 ──</option>
              <option value="포르쉐 718">포르쉐 718</option>
              <option value="포르쉐 911">포르쉐 911</option>
              <option value="포르쉐 카이엔">포르쉐 카이엔</option>
              <option value="포르쉐 파나메라">포르쉐 파나메라</option>
              <option value="포르쉐 마칸">포르쉐 마칸</option>
              <option value="포르쉐 타이칸">포르쉐 타이칸</option>
              <option disabled>── 폭스바겐 ──</option>
              <option value="폭스바겐 티구안">폭스바겐 티구안</option>
              <option value="폭스바겐 아테온">폭스바겐 아테온</option>
              <option value="폭스바겐 제타">폭스바겐 제타</option>
              <option value="폭스바겐 골프">폭스바겐 골프</option>
              <option value="폭스바겐 투아렉">폭스바겐 투아렉</option>
              <option value="폭스바겐 파사트">폭스바겐 파사트</option>
              <option disabled>────────</option>
              <option value="기타">기타 (문의사항에 기재)</option>
            </select>
            <button
              className="hero-mini-submit"
              onClick={() => scrollTo("contact")}
              disabled={!formData.name || !formData.phone}
            >
              상담 신청
            </button>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="about-section" id="about" ref={registerRef("about")}>
        <div className="about-inner">
          <div className={`fade-up ${isVisible("about") ? "visible" : ""}`}>
            <span className="grad-label">About</span>
            <h2 className="about-heading">
              불편하고 비합리적인
              <br />
              중고차 시장을 혁신하기 위해
              <br />
              출발했습니다.
            </h2>
            <p className="about-sub">
              사고복원 차량의 부정적 이미지를 바꾸기 위해 출발했습니다.
              <br />
              사람들의 카 라이프가 더 합리적이고 새로워질 수 있는 방법을 고민하고 있습니다.
            </p>
          </div>
          <div className={`about-cards fade-up fade-up-d2 ${isVisible("about") ? "visible" : ""}`}>
            <div className="about-card">
              <p className="about-card-label">
                REBORN LABS와
                <br />
                함께한 고객
              </p>
              <p className="about-card-number">1,274+</p>
            </div>
            <div className="about-card">
              <p className="about-card-label">
                누적 차량
                <br />
                출고 대수
              </p>
              <p className="about-card-number">2,560+</p>
            </div>
            <div className="about-card">
              <p className="about-card-label">
                REBORN LABS
                <br />
                누적 거래액
              </p>
              <p className="about-card-number">312억 원</p>
            </div>
          </div>
          <div className={`about-cta-wrap fade-up fade-up-d3 ${isVisible("about") ? "visible" : ""}`}>
            <button className="about-cta" onClick={() => scrollTo("contact")}>
              더 알아보기
            </button>
          </div>
        </div>
      </section>

      {/* Business Structure */}
      <section className="structure-section" id="structure" ref={registerRef("structure")}>
        <div className="structure-bg">
          <Image
            src="/structure-bg.webp"
            alt="자동차 정비 공업사 내부"
            fill
            quality={100}
            style={{ objectFit: "cover", objectPosition: "center" }}
            unoptimized
          />
        </div>
        <div className="structure-overlay" />
        <div className="structure-inner">
          <div className={`structure-header fade-up ${isVisible("structure") ? "visible" : ""}`}>
            <span className="grad-label">Business Structure</span>
            <h2 className="structure-heading">
              매입부터 재판매까지,
              <br />
              순환하는 비즈니스 모델
            </h2>
            <p className="structure-sub">
              경미한 사고 차량을 저가 매입하고, 완전 복원 후
              <br />
              반납형 상품으로 출고합니다. 반납된 차량은 재판매됩니다.
            </p>
          </div>

          <div className={`structure-timeline fade-up fade-up-d2 ${isVisible("structure") ? "visible" : ""}`}>
            <div className="structure-step">
              <p className="structure-step-num">Step 01</p>
              <h3 className="structure-step-title">경미 사고 차량 매입</h3>
              <p className="structure-step-desc">
                침수, 엔진, 프레임 이상이 없는 경미한 사고 이력 차량만을 선별합니다.
                보험 처리하기 어려운 수준의 공업 비용으로 처리된 차량을
                시장가 대비 저렴하게 매입합니다.
              </p>
            </div>
            <div className="structure-step">
              <p className="structure-step-num">Step 02</p>
              <h3 className="structure-step-title">1등급 공업사 완전 복원</h3>
              <p className="structure-step-desc">
                협력 1등급 공업사에서 외관, 내장, 기능 전반을 점검하고
                완전히 복원합니다. 주행에 문제가 없는 상태로 출고되며,
                복원 이력은 고객에게 투명하게 공개됩니다.
              </p>
            </div>
            <div className="structure-step">
              <p className="structure-step-num">Step 03</p>
              <h3 className="structure-step-title">반납형 상품 출고</h3>
              <p className="structure-step-desc">
                복원된 차량은 36개월 이용 후 반납하는 구조의 상품으로 출고됩니다.
                할부 60개월 중 24개월분을 잔존가치로 설정하여
                고객의 월 납입료를 최소화합니다.
              </p>
            </div>
            <div className="structure-step">
              <p className="structure-step-num">Step 04</p>
              <h3 className="structure-step-title">36개월 후 차량 반납</h3>
              <p className="structure-step-desc">
                이용 기간이 종료되면 고객은 차량을 회사에 의무 반납합니다.
                보증금은 차량 상태 확인 후 정산 처리되며,
                고객은 추가 부담 없이 이용을 종료합니다.
              </p>
            </div>
            <div className="structure-step">
              <p className="structure-step-num">Step 05</p>
              <h3 className="structure-step-title">회수 차량 재판매</h3>
              <p className="structure-step-desc">
                반납된 차량은 잔존가치를 기반으로 재판매됩니다.
                매입 → 복원 → 출고 → 반납 → 재판매로 이어지는
                순환 구조가 REBORN LABS의 핵심 비즈니스 모델입니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Market */}
      <section className="market-section" id="market" ref={registerRef("market")}>
        <div className="market-inner">
          <div className={`market-header fade-up ${isVisible("market") ? "visible" : ""}`}>
            <span className="grad-label">Market</span>
            <h2 className="market-heading">
              폐쇄적 시장,
              <br />
              최초의 반납형 구조
            </h2>
            <p className="market-desc">
              연간 전손 및 분손 처리되는 사고차량 시장은 규모가 상당하지만,
              업종 종사자 외에는 접근이 불가능한 폐쇄적 구조입니다.
              REBORN LABS는 이 시장에 반납형 상품이라는
              새로운 구조를 최초로 도입합니다.
            </p>
          </div>

          <div className={`market-stats fade-up fade-up-d2 ${isVisible("market") ? "visible" : ""}`}>
            <div className="market-stat-card">
              <p className="market-stat-eyebrow">연간 사고차량 규모</p>
              <p className="market-stat-number">
                10<span className="market-stat-unit">만대</span>
              </p>
              <p className="market-stat-label">
                매년 전손·분손 처리되는 국내 사고차량 규모.
                이 중 상당수가 복원 가능한 상태로 폐기됩니다.
              </p>
            </div>
            <div className="market-stat-card">
              <p className="market-stat-eyebrow">즉시 활용 가능 차량</p>
              <p className="market-stat-number">
                2<span className="market-stat-unit">만대</span>
              </p>
              <p className="market-stat-label">
                침수·엔진·프레임 이상이 없는 경미 사고 차량.
                전체의 20%, REBORN LABS의 매입 대상입니다.
              </p>
            </div>
            <div className="market-stat-card">
              <p className="market-stat-eyebrow">반납형 경쟁사</p>
              <p className="market-stat-number">
                0<span className="market-stat-unit">곳</span>
              </p>
              <p className="market-stat-label">
                사고복원 차량을 반납형 상품으로 제공하는 곳은
                현재 REBORN LABS가 유일합니다.
              </p>
            </div>
          </div>

          <div className={`market-bottom fade-up fade-up-d3 ${isVisible("market") ? "visible" : ""}`}>
            <div className="market-bottom-text">
              <h3 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.5px", marginBottom: "28px", color: "#fff", lineHeight: 1.4 }}>
                닫혀 있던 시장을,<br className="mobile-br" /> 소비자에게 열다
              </h3>
              <p>
                사고차량 시장은 보험사, 경매업체, 매매상 등
                업계 종사자들만 접근할 수 있는 폐쇄적 구조로 운영됩니다.
                일반 소비자는 이 시장의 존재조차 알기 어렵습니다.
              </p>
              <br />
              <p>
                REBORN LABS는 이 시장에서 엄선된 차량만 매입하여
                완전히 복원한 뒤, 반납형 상품이라는 전에 없던 구조로
                소비자에게 직접 제공합니다.
              </p>
            </div>
            <div className="market-bottom-image" style={{ position: "relative" }}>
              <Image
                src="/market-detail.webp"
                alt="차량 검수 과정"
                fill
                quality={100}
                style={{ objectFit: "cover", objectPosition: "center", borderRadius: "20px" }}
                unoptimized
              />
            </div>
          </div>
        </div>
      </section>

      {/* Quote */}
      <div className="quote-band" id="quote" ref={registerRef("quote")}>
        <div className={`quote-inner fade-up ${isVisible("quote") ? "visible" : ""}`}>
          <p className="quote-text">
            같은 차, 같은 성능.
            <br />
            절반의 비용으로.
          </p>
          <div className="quote-line" />
          <p className="quote-sub">
            렌터카·리스 대비 월등히 <span className="quote-highlight">저렴한 월 납입료</span>로
            <br />
            프리미엄 차량을 경험하세요.
          </p>
        </div>
      </div>

      {/* Product */}
      <section className="product-section" id="product" ref={registerRef("product")}>
        <div className="product-inner">
          <div className={`product-header fade-up ${isVisible("product") ? "visible" : ""}`}>
            <span className="grad-label">Product</span>
            <h2 className="product-heading">
              REBORN LABS의 반납형 상품,
              <br />
              이렇게 이용하세요.
            </h2>
          </div>

          {/* 01 - 할부 60개월 구조 */}
          <div className={`product-row fade-up fade-up-d1 ${isVisible("product") ? "visible" : ""}`}>
            <div className="product-text">
              <span className="grad-label" style={{ marginBottom: "20px" }}>할부 60개월 구조</span>
              <h3 className="product-text-title">
                36개월만 납입하고
                <br />
                반납하면
                <br />
                끝입니다
              </h3>
              <p className="product-text-desc">
                할부 60개월 중 24개월분을 잔존가치로 설정합니다.
                <br />
                고객은 36개월만 납입하고 반납하며,
                <br />
                나머지 24개월은 회사가 인수 후 처리합니다.
              </p>
            </div>
            <div className="product-illust">
              <div className="product-illust-box" style={{ position: "relative", padding: 0 }}>
                <Image
                  src="/product-01.webp"
                  alt="할부 60개월 구조"
                  fill
                  quality={100}
                  style={{ objectFit: "cover", objectPosition: "center", borderRadius: "20px" }}
                  unoptimized
                />
              </div>
            </div>
          </div>

          {/* 02 - 일반번호판 사용 */}
          <div className={`product-row reverse fade-up fade-up-d2 ${isVisible("product") ? "visible" : ""}`}>
            <div className="product-text">
              <span className="grad-label" style={{ marginBottom: "20px" }}>일반번호판 사용</span>
              <h3 className="product-text-title">
                렌터카 번호판이 아닌
                <br />
                일반번호판으로
                <br />
                개인 명의 등록
              </h3>
              <p className="product-text-desc">
                할부금융을 이용하기 때문에
                <br />
                렌터카 번호판이 아닌 일반번호판을 사용합니다.
                <br />
                고객 개인 명의로 차량이 등록됩니다.
              </p>
            </div>
            <div className="product-illust">
              <div className="product-illust-box" style={{ position: "relative", padding: 0 }}>
                <Image
                  src="/product-02.webp"
                  alt="일반번호판 사용"
                  fill
                  quality={100}
                  style={{ objectFit: "cover", objectPosition: "center", borderRadius: "20px" }}
                  unoptimized
                />
              </div>
            </div>
          </div>

          {/* 03 - 보증금 제도 */}
          <div className={`product-row fade-up fade-up-d3 ${isVisible("product") ? "visible" : ""}`}>
            <div className="product-text">
              <span className="grad-label" style={{ marginBottom: "20px" }}>보증금 제도</span>
              <h3 className="product-text-title">
                차량가격의 25%
                <br />
                보증금 설정,
                <br />
                반납 시 정산
              </h3>
              <p className="product-text-desc">
                차량 의무반납의 증거금으로
                <br />
                차량가격의 25%를 보증금으로 설정합니다.
                <br />
                반납 완료 시 정산 처리됩니다.
              </p>
            </div>
            <div className="product-illust">
              <div className="product-illust-box" style={{ position: "relative", padding: 0 }}>
                <Image
                  src="/product-03.webp"
                  alt="보증금 제도"
                  fill
                  quality={100}
                  style={{ objectFit: "cover", objectPosition: "center", borderRadius: "20px" }}
                  unoptimized
                />
              </div>
            </div>
          </div>

          {/* 04 - 가격 경쟁력 */}
          <div className={`product-row reverse fade-up fade-up-d4 ${isVisible("product") ? "visible" : ""}`}>
            <div className="product-text">
              <span className="grad-label" style={{ marginBottom: "20px" }}>월등한 가격 경쟁력</span>
              <h3 className="product-text-title">
                렌터카·리스 대비
                <br />
                월등히 저렴한
                <br />
                월 납입료
              </h3>
              <p className="product-text-desc">
                잔존가치 설정 구조 덕분에
                <br />
                동일 차량 기준 렌터카·리스 대비
                <br />
                월 납입료가 월등히 저렴합니다.
              </p>
            </div>
            <div className="product-illust">
              <div className="product-illust-box" style={{ position: "relative", padding: 0 }}>
                <Image
                  src="/product-04.webp"
                  alt="가격 경쟁력 비교"
                  fill
                  quality={100}
                  style={{ objectFit: "cover", objectPosition: "center", borderRadius: "20px" }}
                  unoptimized
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Vehicle Lineup + Contact */}
      <div className="lineup-wrapper" id="lineup" ref={registerRef("lineup")}>
        <div className="lineup-inner">
          <div className={`fade-up ${isVisible("lineup") ? "visible" : ""}`}>
            <p className="lineup-label">Lineup</p>
            <h2 className="lineup-title">가장 많이 찾는 인기 라인업</h2>
            <p className="lineup-desc">
              프리미엄 브랜드 차량을 합리적인 비용으로 만나보세요.
            </p>
          </div>
          <div className={`vehicle-grid fade-up fade-up-d2 ${isVisible("lineup") ? "visible" : ""}`}>
            {vehicles.map((v, i) => (
              <div className="vehicle-card" key={i}>
                <div className="vehicle-image" style={{ position: "relative" }}>
                  <Image
                    src={v.img}
                    alt={v.name}
                    fill
                    quality={100}
                    style={{ objectFit: "cover", objectPosition: "center" }}
                    unoptimized
                  />
                </div>
                <div className="vehicle-info">
                  <h3 className="vehicle-name">{v.name}</h3>
                  <div className="vehicle-detail-row">
                    <span className="vehicle-detail-label">보증금</span>
                    <span className="vehicle-detail-value">{v.deposit}</span>
                  </div>
                  <div className="vehicle-detail-row">
                    <span className="vehicle-detail-label">월 납입료</span>
                    <span className="vehicle-detail-value">{v.monthly}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Contact (nested inside lineup) */}
          <div className="contact-box" id="contact" ref={registerRef("contact")}>
            <div className="contact-content">
              {!submitted ? (
                <>
                  <div className={`fade-up ${isVisible("contact") ? "visible" : ""}`} style={{ textAlign: "center", marginBottom: "60px" }}>
                    <p className="section-label" style={{ textAlign: "center" }}>
                      Contact
                    </p>
                    <h2 className="section-title" style={{ textAlign: "center" }}>
                      상담 신청
                    </h2>
                    <p
                      className="section-desc"
                      style={{
                        textAlign: "center",
                        margin: "0 auto",
                      }}
                    >
                      관심 있는 차량과 연락처를 남겨주시면
                      <br />
                      담당 매니저가 빠르게 연락드리겠습니다.
                    </p>
                  </div>
                  <div className={`fade-up fade-up-d2 ${isVisible("contact") ? "visible" : ""}`}>
                    <div className="form-group">
                      <label className="form-label">이름</label>
                      <input
                        className="form-input"
                        type="text"
                        placeholder="홍길동"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">연락처</label>
                      <input
                        className="form-input"
                        type="tel"
                        placeholder="010-0000-0000"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">관심 차종</label>
                      <select
                        className="form-select"
                        value={formData.vehicle}
                        onChange={(e) =>
                          setFormData({ ...formData, vehicle: e.target.value })
                        }
                      >
                        <option value="">현재 출고 가능한 차량입니다</option>
                        <option disabled>── 현대 ──</option>
                        <option value="현대 그랜저">현대 그랜저</option>
                        <option value="현대 싼타페">현대 싼타페</option>
                        <option value="현대 펠리세이드">현대 펠리세이드</option>
                        <option value="현대 아이오닉6">현대 아이오닉6</option>
                        <option disabled>── 제네시스 ──</option>
                        <option value="제네시스 G70">제네시스 G70</option>
                        <option value="제네시스 G80">제네시스 G80</option>
                        <option value="제네시스 EQ900">제네시스 EQ900</option>
                        <option value="제네시스 GV70">제네시스 GV70</option>
                        <option value="제네시스 GV80">제네시스 GV80</option>
                        <option disabled>── BMW ──</option>
                        <option value="BMW 3시리즈">BMW 3시리즈</option>
                        <option value="BMW 5시리즈">BMW 5시리즈</option>
                        <option value="BMW 7시리즈">BMW 7시리즈</option>
                        <option value="BMW 8시리즈">BMW 8시리즈</option>
                        <option value="BMW X3">BMW X3</option>
                        <option value="BMW X5">BMW X5</option>
                        <option value="BMW X6">BMW X6</option>
                        <option value="BMW X7">BMW X7</option>
                        <option disabled>── 랜드로버 ──</option>
                        <option value="랜드로버 디스커버리 스포츠">랜드로버 디스커버리 스포츠</option>
                        <option value="랜드로버 디스커버리">랜드로버 디스커버리</option>
                        <option value="랜드로버 디펜더">랜드로버 디펜더</option>
                        <option value="랜드로버 레인지로버 벨라">랜드로버 레인지로버 벨라</option>
                        <option value="랜드로버 레인지로버 스포츠">랜드로버 레인지로버 스포츠</option>
                        <option value="랜드로버 레인지로버 이보크">랜드로버 레인지로버 이보크</option>
                        <option value="랜드로버 레인지로버">랜드로버 레인지로버</option>
                        <option disabled>── 마세라티 ──</option>
                        <option value="마세라티 르반떼">마세라티 르반떼</option>
                        <option value="마세라티 기블리">마세라티 기블리</option>
                        <option value="마세라티 콰트로포르테">마세라티 콰트로포르테</option>
                        <option value="마세라티 그란투리스모">마세라티 그란투리스모</option>
                        <option value="마세라티 그란카브리오">마세라티 그란카브리오</option>
                        <option disabled>── 마이바흐 ──</option>
                        <option value="마이바흐 57">마이바흐 57</option>
                        <option value="마이바흐 57S">마이바흐 57S</option>
                        <option value="마이바흐 62">마이바흐 62</option>
                        <option value="마이바흐 62S">마이바흐 62S</option>
                        <option value="마이바흐 57제플린">마이바흐 57제플린</option>
                        <option value="마이바흐 62제플린">마이바흐 62제플린</option>
                        <option value="마이바흐 62S렌들렛">마이바흐 62S렌들렛</option>
                        <option disabled>── 벤츠 ──</option>
                        <option value="벤츠 C-클래스">벤츠 C-클래스</option>
                        <option value="벤츠 E-클래스">벤츠 E-클래스</option>
                        <option value="벤츠 S-클래스">벤츠 S-클래스</option>
                        <option value="벤츠 CLS-클래스">벤츠 CLS-클래스</option>
                        <option value="벤츠 GLC-클래스">벤츠 GLC-클래스</option>
                        <option value="벤츠 GLE-클래스">벤츠 GLE-클래스</option>
                        <option disabled>── 아우디 ──</option>
                        <option value="아우디 A4">아우디 A4</option>
                        <option value="아우디 A5">아우디 A5</option>
                        <option value="아우디 A6">아우디 A6</option>
                        <option value="아우디 A7">아우디 A7</option>
                        <option value="아우디 Q5">아우디 Q5</option>
                        <option value="아우디 Q7">아우디 Q7</option>
                        <option disabled>── 지프 ──</option>
                        <option value="지프 글래디에이터">지프 글래디에이터</option>
                        <option value="지프 랭글러">지프 랭글러</option>
                        <option value="지프 레니게이드">지프 레니게이드</option>
                        <option value="지프 체로키">지프 체로키</option>
                        <option disabled>── 재규어 ──</option>
                        <option value="재규어 XF">재규어 XF</option>
                        <option value="재규어 F-TYPE">재규어 F-TYPE</option>
                        <option value="재규어 F-PACE">재규어 F-PACE</option>
                        <option value="재규어 XE">재규어 XE</option>
                        <option disabled>── 테슬라 ──</option>
                        <option value="테슬라 모델3">테슬라 모델3</option>
                        <option value="테슬라 모델S">테슬라 모델S</option>
                        <option value="테슬라 모델X">테슬라 모델X</option>
                        <option value="테슬라 모델Y">테슬라 모델Y</option>
                        <option disabled>── 포르쉐 ──</option>
                        <option value="포르쉐 718">포르쉐 718</option>
                        <option value="포르쉐 911">포르쉐 911</option>
                        <option value="포르쉐 카이엔">포르쉐 카이엔</option>
                        <option value="포르쉐 파나메라">포르쉐 파나메라</option>
                        <option value="포르쉐 마칸">포르쉐 마칸</option>
                        <option value="포르쉐 타이칸">포르쉐 타이칸</option>
                        <option disabled>── 폭스바겐 ──</option>
                        <option value="폭스바겐 티구안">폭스바겐 티구안</option>
                        <option value="폭스바겐 아테온">폭스바겐 아테온</option>
                        <option value="폭스바겐 제타">폭스바겐 제타</option>
                        <option value="폭스바겐 골프">폭스바겐 골프</option>
                        <option value="폭스바겐 투아렉">폭스바겐 투아렉</option>
                        <option value="폭스바겐 파사트">폭스바겐 파사트</option>
                        <option disabled>────────</option>
                        <option value="기타">기타 (문의사항에 기재)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">문의사항</label>
                      <textarea
                        className="form-textarea"
                        placeholder="궁금한 점을 자유롭게 작성해주세요"
                        value={formData.message}
                        onChange={(e) =>
                          setFormData({ ...formData, message: e.target.value })
                        }
                      />
                    </div>
                    <button
                      className="form-submit"
                      onClick={handleSubmit}
                      disabled={!formData.name || !formData.phone || submitting}
                    >
                      {submitting ? "신청 중..." : "상담 신청하기"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="success-message">
                  <h3 className="success-title">
                    상담 신청이 완료되었습니다
                  </h3>
                  <p className="success-desc">
                    남겨주신 연락처로 담당 매니저가
                    <br />
                    빠른 시일 내에 연락드리겠습니다.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-inner">
          <p className="footer-logo">REBORN LABS</p>
          <p className="footer-info">
            대표 심재윤
            <br />
            서울특별시 성동구 아차산로7길 21, 4층 199호 (성수동2가)
            <br />
            대표전화{" "}
            <a href="tel:02-462-5222" className="footer-tel">
              02-462-5222
            </a>
          </p>
          <p className="footer-copy">
            © {new Date().getFullYear()} REBORN LABS. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}
