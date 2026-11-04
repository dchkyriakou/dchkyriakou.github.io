#!/usr/bin/env python3
"""Generates the capabilities accordion (also the data source for the 3D map) and writes it
into index.html between the KNOWLEDGE markers. Run: python3 tools/build_knowledge.py

Nodes in the 3D map are capabilities and projects. Courses appear only as evidence in the
panel / accordion. Grades are out of 10 and only listed where the owner provided them.
Each capability lists the projects that show it (kept deliberately conservative).
"""
import html
import pathlib
import re

# (domain id, label, [capabilities (id, label, [project ids])], [courses (label, grade)])
DOMAINS = [
    ("signals", "Signal processing", [
        ("cap-biosignals", "Biomedical signal processing (PPG, accelerometry, LFP)", ["thesis", "tamu", "fudan"]),
        ("cap-spectral", "Spectral and time-frequency analysis (Welch PSD, spectrograms, FOOOF)", ["thesis", "fudan"]),
        ("cap-quality", "Signal-quality assessment and artifact removal", ["thesis", "fudan"]),
        ("cap-prv", "HRV / PRV analysis", ["thesis"]),
        ("cap-filtering", "Filtering and sampling (FIR / IIR, Nyquist)", ["fudan"]),
    ], [
        ("Signals & Systems", None), ("Stochastic Signals & Processes", "8"), ("Probability & Statistics", "8"),
        ("Estimation & Detection Theory", "8.5"), ("Time Series", None), ("Digital Image Processing", None),
        ("Telecommunication Systems I & II", None), ("Applications of Telecom Devices", "9"),
    ]),
    ("ml", "Machine learning & statistics", [
        ("cap-validation", "Nested cross-validation and corrected statistical tests", ["thesis"]),
        ("cap-features", "Feature engineering and selection", ["thesis"]),
        ("cap-models", "Logistic Regression, Random Forest, XGBoost, SVM", ["thesis"]),
        ("cap-stats", "ICC repeatability, ANCOVA", ["thesis"]),
        ("cap-nn", "Neural networks and deep learning", []),
    ], [
        ("Pattern Recognition & Machine Learning", None), ("Neural Networks & Deep Learning", "9.6"),
        ("Computational Intelligence", "9.5"), ("Optimization Techniques", None), ("Data Analysis", "10"),
        ("Numerical Analysis", None), ("Applied Mathematics I & II", None), ("Linear Algebra", None),
    ]),
    ("bio", "Biomedical engineering", [
        ("cap-wearable", "Wearable PPG sensing", ["thesis", "tamu"]),
        ("cap-clinical", "IRB-approved human-subjects study", ["tamu"]),
        ("cap-neuro", "Neural recordings and deep brain stimulation", ["fudan"]),
    ], [
        ("Biomedical Technology", "10"),
    ]),
    ("electronics", "Electronics & measurement", [
        ("cap-sensorval", "Sensor validation against a clinical reference", ["tamu"]),
        ("cap-spo2", "Perfusion index and SpO2 estimation", ["tamu"]),
        ("cap-electronics", "Analog and digital electronics", []),
    ], [
        ("Electronics I", None), ("Electronics II", "10"), ("Measurement Systems", "10"),
        ("Electric Circuits I & II", None), ("Logic Design", None), ("Computer Organization", None),
        ("Electromagnetic Fields I & II", None), ("Electrical Materials", None),
    ]),
    ("control", "Control", [
        ("cap-closedloop", "Closed-loop system design", ["fudan"]),
    ], [
        ("Automatic Control Systems I & II", None),
    ]),
    ("energy", "Energy & power", [
        ("cap-power", "Power systems and renewable energy", []),
        ("cap-dg", "Distributed generation", []),
        ("cap-w2e", "Waste-to-energy prototyping", ["iftp"]),
    ], [
        ("Power Systems I & II", None), ("Renewable Energy Sources", "8.5"), ("Distributed Generation", "10"),
        ("Applied Thermodynamics", None),
    ]),
    ("software", "Software & data", [
        ("cap-python", "Python data stack (NumPy, Pandas, SciPy, scikit-learn, statsmodels)", ["thesis", "tamu", "fudan"]),
        ("cap-sql", "SQL / PostgreSQL", []),
        ("cap-web", "Web development, SEO and performance", ["artio", "elysium"]),
        ("cap-algo", "Data structures and algorithms", []),
    ], [
        ("Structured Programming", None), ("Object-Oriented Programming", "8.5"), ("Data Structures", None),
        ("Algorithm Analysis & Design", None), ("Operating Systems", "8"), ("Databases", "8"),
        ("Software Engineering I", "8"), ("Computer Networks I", "9"), ("Network Theory", "8"),
    ]),
    ("physics", "Physics", [
        ("cap-physics", "Physics fundamentals, including quantum physics", []),
    ], [
        ("Physics", None), ("Quantum Physics", "10"),
    ]),
    ("econ", "Economics & ventures", [
        ("cap-venture", "Founding and building a product", ["artio"]),
        ("cap-ops", "Operations and guest communication", ["elysium"]),
        ("cap-invest", "Investment evaluation", []),
    ], [
        ("Principles of Economics", None), ("Investment Evaluation", "10"),
    ]),
]

PROJECTS = [
    ("thesis", "Diploma thesis", "bio", "#thesis",
     "Wrist-PPG biomarkers for Parkinson's, graded 10/10: 249.3 M candidate windows through a four-stage quality gate to 101.3 M clean, 594 features per participant, +0.30 ROC-AUC over age and sex in all four models."),
    ("tamu", "Texas A&M optical biosensing", "bio", "#p-tamu",
     "IRB-approved human-subjects study (2024): two PPG devices at chest, forehead and finger, three contact pressures, validated against a Masimo oximeter; first-author poster."),
    ("fudan", "Fudan neural signals & DBS", "bio", "#p-grips",
     "GRIPS 2025: Python pipeline for clinical LFP recordings (Welch PSD, spectrograms, FOOOF) and 130 Hz DBS artifact removal; closed-loop neuromodulation system design."),
    ("iftp", "Invent for the Planet 2022", "energy", "#p-iftp",
     "People's Choice among 25 teams: an anaerobic digester turning household organic waste into gas for building heating."),
    ("artio", "ART.IO (founder)", "econ", "#ventures",
     "Founded a 3D virtual-tour venture and built the product and its website."),
    ("elysium", "Elysium Retreat", "econ", "#ventures",
     "Own short-term rental since 2022: designed and built the website, run guest communication and operations."),
]


def e(s):
    return html.escape(s, quote=True)


def build():
    proj = {p[0]: p for p in PROJECTS}
    out = ['<div class="km-list" data-km-list>']
    for did, label, caps, courses in DOMAINS:
        pids = []
        for _, _, ps in caps:
            for p in ps:
                if p not in pids:
                    pids.append(p)
        out.append(f'  <details class="km-domain" data-domain="{did}" data-label="{e(label)}">')
        out.append(f'    <summary><span class="km-domain-name">{e(label)}</span></summary>')
        out.append('    <ul class="km-caps">')
        for cid, clabel, ps in caps:
            out.append(f'      <li data-id="{cid}" data-projects="{" ".join(ps)}">{e(clabel)}</li>')
        out.append('    </ul>')
        out.append('    <p class="km-sub">Coursework</p>')
        out.append('    <ul class="km-courses">')
        for cname, grade in courses:
            g = f' data-grade="{grade}"' if grade else ''
            gs = f' <span class="km-grade">{grade}</span>' if grade else ''
            out.append(f'      <li{g}><span>{e(cname)}</span>{gs}</li>')
        out.append('    </ul>')
        if pids:
            links = ', '.join(f'<a href="{proj[p][3]}">{e(proj[p][1])}</a>' for p in pids)
            out.append(f'    <p class="km-used">Shown in: {links}</p>')
        out.append('  </details>')
    out.append('  <ul class="km-projects-data" hidden>')
    for pid, name, home, href, evidence in PROJECTS:
        out.append(f'    <li data-id="{pid}" data-domain="{home}" data-href="{href}" data-label="{e(name)}">{e(evidence)}</li>')
    out.append('  </ul>')
    out.append('</div>')
    return '\n'.join(out)


if __name__ == '__main__':
    root = pathlib.Path(__file__).resolve().parent.parent
    page = root / 'index.html'
    src = page.read_text()
    block = '<!-- KNOWLEDGE:START (generated by tools/build_knowledge.py) -->\n' + build() + '\n<!-- KNOWLEDGE:END -->'
    new, n = re.subn(r'<!-- KNOWLEDGE:START.*?<!-- KNOWLEDGE:END -->', block, src, flags=re.S)
    if n != 1:
        raise SystemExit('KNOWLEDGE markers not found exactly once')
    page.write_text(new)
    print('knowledge block written')
