# -*- coding: utf-8 -*-
"""
Gera o relatório de auditoria de segurança em PDF.

Uso (a partir da raiz do repositório):
    docs/security-audit/.venv/Scripts/python.exe docs/security-audit/gerar_relatorio.py

O conteúdo mora em achados.py — este arquivo só desenha. Separados porque a
lista de achados muda a cada correção, e o layout não.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, KeepTogether, PageBreak,
)

from achados import (
    PROJETO, DATA, CORES, ROTULO_SEVERIDADE, CATEGORIAS, ESCOPO, METODOLOGIA,
    ACHADOS, PONTOS_FORTES, PONTOS_FRACOS, RECOMENDACOES,
)

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "relatorio-auditoria-seguranca.pdf")
TITULO = f"Relatório de Auditoria de Segurança — {PROJETO}"

TINTA = colors.HexColor("#1F2937")
TINTA_FRACA = colors.HexColor("#6B7280")
TRACO = colors.HexColor("#D1D5DB")
FUNDO_CODIGO = colors.HexColor("#F3F4F6")

# ── estilos ─────────────────────────────────────────────────────────────────
base = getSampleStyleSheet()

E = {
    "capa_titulo": ParagraphStyle(
        "capa_titulo", parent=base["Title"], fontName="Helvetica-Bold",
        fontSize=26, leading=31, textColor=TINTA, alignment=TA_CENTER, spaceAfter=6),
    "capa_sub": ParagraphStyle(
        "capa_sub", parent=base["Normal"], fontSize=12, leading=17,
        textColor=TINTA_FRACA, alignment=TA_CENTER),
    "h1": ParagraphStyle(
        "h1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=16,
        leading=20, textColor=TINTA, spaceBefore=16, spaceAfter=9),
    "h2": ParagraphStyle(
        "h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12,
        leading=16, textColor=TINTA, spaceBefore=12, spaceAfter=5),
    "p": ParagraphStyle(
        "p", parent=base["Normal"], fontSize=9.5, leading=14,
        textColor=TINTA, alignment=TA_JUSTIFY, spaceAfter=6),
    "pequeno": ParagraphStyle(
        "pequeno", parent=base["Normal"], fontSize=8.5, leading=12.5,
        textColor=TINTA, alignment=TA_JUSTIFY),
    "codigo": ParagraphStyle(
        "codigo", parent=base["Normal"], fontName="Courier", fontSize=7.4,
        leading=10, textColor=colors.HexColor("#111827"),
        backColor=FUNDO_CODIGO, borderPadding=6, spaceBefore=3, spaceAfter=5),
    "rotulo": ParagraphStyle(
        "rotulo", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.5,
        leading=10, textColor=TINTA_FRACA, spaceBefore=4),
    "celula": ParagraphStyle(
        "celula", parent=base["Normal"], fontSize=8, leading=11, textColor=TINTA),
    "chip": ParagraphStyle(
        "chip", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.5,
        leading=10, textColor=colors.white, alignment=TA_CENTER),
    "issue": ParagraphStyle(
        "issue", parent=base["Normal"], fontName="Courier", fontSize=7.2,
        leading=9.6, textColor=colors.HexColor("#111827")),
}


def cor(sev):
    return colors.HexColor(CORES.get(sev, "#6B7280"))


def chip(sev):
    """Selo colorido de severidade — uma tabela de uma célula, para ter fundo."""
    t = Table([[Paragraph(ROTULO_SEVERIDADE[sev], E["chip"])]],
              colWidths=[2.05 * cm], rowHeights=[0.5 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), cor(sev)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 1),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    return t


def bloco_codigo(txt):
    seguro = (txt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                 .replace("\n", "<br/>").replace(" ", "&nbsp;"))
    return Paragraph(seguro, E["codigo"])


# ── gráficos ────────────────────────────────────────────────────────────────
def grafico_rosca(caminho):
    por_sev = {}
    for a in ACHADOS:
        por_sev[a["severidade"]] = por_sev.get(a["severidade"], 0) + 1
    ordem = [s for s in ("critica", "alta", "media", "baixa") if s in por_sev]

    fig, ax = plt.subplots(figsize=(4.0, 3.0), dpi=220)
    valores = [por_sev[s] for s in ordem]
    cores = [CORES[s] for s in ordem]
    rotulos = [f"{ROTULO_SEVERIDADE[s].title()} ({por_sev[s]})" for s in ordem]

    fatias, _ = ax.pie(valores, colors=cores, startangle=90,
                       wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2))
    ax.text(0, 0.07, str(sum(valores)), ha="center", va="center",
            fontsize=25, fontweight="bold", color="#1F2937")
    ax.text(0, -0.24, "achados", ha="center", va="center",
            fontsize=8.5, color="#6B7280")
    ax.legend(fatias, rotulos, loc="center left", bbox_to_anchor=(1.0, 0.5),
              frameon=False, fontsize=8.5)
    ax.set_aspect("equal")
    fig.tight_layout()
    fig.savefig(caminho, transparent=True, bbox_inches="tight")
    plt.close(fig)


def grafico_barras(caminho):
    por_cat = {k: 0 for k in CATEGORIAS}
    pior = {}
    peso = {"critica": 4, "alta": 3, "media": 2, "baixa": 1}
    for a in ACHADOS:
        por_cat[a["categoria"]] += 1
        if peso[a["severidade"]] > peso.get(pior.get(a["categoria"], "baixa"), 0):
            pior[a["categoria"]] = a["severidade"]

    chaves = list(CATEGORIAS.keys())
    valores = [por_cat[k] for k in chaves]
    cores = [CORES[pior[k]] if por_cat[k] else "#D1D5DB" for k in chaves]

    fig, ax = plt.subplots(figsize=(6.2, 2.5), dpi=220)
    y = range(len(chaves))
    ax.barh(list(y), valores, color=cores, height=0.6)
    ax.set_yticks(list(y))
    ax.set_yticklabels([f"{k} · {CATEGORIAS[k]}" for k in chaves], fontsize=8.5)
    ax.invert_yaxis()
    ax.set_xlim(0, max(valores + [1]) + 0.6)
    ax.set_xticks(range(0, max(valores + [1]) + 1))
    ax.tick_params(axis="x", labelsize=8)
    for lado in ("top", "right", "left"):
        ax.spines[lado].set_visible(False)
    ax.spines["bottom"].set_color("#D1D5DB")
    ax.grid(axis="x", color="#E5E7EB", linewidth=0.7)
    ax.set_axisbelow(True)
    for i, v in enumerate(valores):
        if v:
            ax.text(v + 0.12, i, str(v), va="center", fontsize=8.5,
                    fontweight="bold", color="#1F2937")
        else:
            ax.text(0.12, i, "nenhum", va="center", fontsize=8,
                    color="#059669", style="italic")
    fig.tight_layout()
    fig.savefig(caminho, transparent=True, bbox_inches="tight")
    plt.close(fig)


# ── cabeçalho e rodapé ──────────────────────────────────────────────────────
def moldura(canvas, doc):
    canvas.saveState()
    L, A = A4
    if doc.page > 1:
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(TINTA_FRACA)
        canvas.drawString(2 * cm, A - 1.25 * cm, TITULO)
        canvas.setStrokeColor(TRACO)
        canvas.setLineWidth(0.5)
        canvas.line(2 * cm, A - 1.4 * cm, L - 2 * cm, A - 1.4 * cm)
        canvas.line(2 * cm, 1.5 * cm, L - 2 * cm, 1.5 * cm)
        canvas.drawString(2 * cm, 1.1 * cm, DATA)
        canvas.drawRightString(L - 2 * cm, 1.1 * cm, f"Página {doc.page}")
    canvas.restoreState()


# ── conteúdo ────────────────────────────────────────────────────────────────
def montar():
    rosca = os.path.join(AQUI, "_rosca.png")
    barras = os.path.join(AQUI, "_barras.png")
    grafico_rosca(rosca)
    grafico_barras(barras)

    hist = {}
    for a in ACHADOS:
        hist[a["severidade"]] = hist.get(a["severidade"], 0) + 1

    S = []

    # ── capa ────────────────────────────────────────────────────────────
    S.append(Spacer(1, 3.6 * cm))
    S.append(Paragraph(f"Relatório de Auditoria<br/>de Segurança", E["capa_titulo"]))
    S.append(Paragraph(PROJETO, ParagraphStyle(
        "cp", parent=E["capa_sub"], fontSize=16, textColor=cor("critica"),
        fontName="Helvetica-Bold", spaceBefore=4)))
    S.append(Spacer(1, 0.5 * cm))
    S.append(Paragraph(DATA, E["capa_sub"]))
    S.append(Spacer(1, 1.4 * cm))

    resumo = [[Paragraph(f"<b>{hist.get(s,0)}</b>", ParagraphStyle(
                    "n", parent=E["chip"], fontSize=19, leading=22)) ,]
              for s in ()]
    linha_sev = [s for s in ("critica", "alta", "media", "baixa")]
    tabela_capa = Table(
        [[Paragraph(str(hist.get(s, 0)), ParagraphStyle(
            "nn", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=20,
            leading=23, alignment=TA_CENTER, textColor=colors.white))
          for s in linha_sev],
         [Paragraph(ROTULO_SEVERIDADE[s], ParagraphStyle(
             "ll", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.5,
             alignment=TA_CENTER, textColor=colors.white))
          for s in linha_sev]],
        colWidths=[3.1 * cm] * 4)
    estilo_capa = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                   ("TOPPADDING", (0, 0), (-1, 0), 10),
                   ("BOTTOMPADDING", (0, 1), (-1, 1), 10)]
    for i, s in enumerate(linha_sev):
        estilo_capa.append(("BACKGROUND", (i, 0), (i, 1), cor(s)))
    tabela_capa.setStyle(TableStyle(estilo_capa))
    S.append(tabela_capa)
    S.append(Spacer(1, 1.4 * cm))

    S.append(Paragraph("Escopo auditado", E["h2"]))
    S.append(Paragraph(ESCOPO, E["p"]))
    S.append(Paragraph(
        "Auditoria estática, feita sobre o código e sobre o dump do schema de produção "
        "versionado no repositório. Nenhum teste foi executado contra o banco em produção — "
        "os achados que dependem do estado real do banco estão marcados com essa condição.",
        E["p"]))

    S.append(PageBreak())

    # ── metodologia ─────────────────────────────────────────────────────
    S.append(Paragraph("Nota metodológica", E["h1"]))
    S.append(Paragraph(
        "Cada uma das cinco categorias pedidas foi traduzida para o equivalente desta stack "
        "antes de procurar qualquer coisa. Categoria que não se aplica está dita como tal, "
        "em vez de preenchida à força.", E["p"]))
    for titulo, texto in METODOLOGIA:
        S.append(Paragraph(titulo, E["h2"]))
        S.append(Paragraph(texto, E["p"]))

    S.append(PageBreak())

    # ── resumo executivo ────────────────────────────────────────────────
    S.append(Paragraph("Resumo executivo", E["h1"]))
    S.append(Paragraph(
        f"Foram encontrados <b>{len(ACHADOS)} achados</b> e registrados "
        f"<b>{len(PONTOS_FORTES)} pontos fortes</b> verificados. "
        "O sistema tem uma base de segurança sólida — RLS em todas as tabelas, papel anônimo "
        "revogado, nenhum sink de XSS, e verificação de autorização em 50 das 55 funções "
        "privilegiadas. O risco central não é ausência de proteção: é <b>uma política antiga "
        "que sobreviveu a uma migração de endurecimento</b> e, por ser combinada por OU, "
        "anula a proteção nova.", E["p"]))
    S.append(Spacer(1, 0.3 * cm))

    S.append(Paragraph("Achados por severidade", E["h2"]))
    S.append(Image(rosca, width=11.2 * cm, height=6.1 * cm, hAlign="CENTER"))
    S.append(Spacer(1, 0.4 * cm))
    S.append(Paragraph("Achados por categoria", E["h2"]))
    S.append(Paragraph(
        "A barra usa a cor da <i>pior</i> severidade da categoria.", E["pequeno"]))
    S.append(Spacer(1, 0.2 * cm))
    S.append(Image(barras, width=15.5 * cm, height=6.3 * cm, hAlign="CENTER"))

    S.append(PageBreak())

    # ── pontos fortes ───────────────────────────────────────────────────
    S.append(Paragraph("Pontos fortes verificados", E["h1"]))
    S.append(Paragraph(
        "O que foi conferido e está correto. Serve como prova de cobertura da auditoria: "
        "estes pontos foram procurados e encontrados em ordem.", E["p"]))
    linhas = [[Paragraph("<b>O que está protegido</b>", E["celula"]),
               Paragraph("<b>Evidência</b>", E["celula"])]]
    for titulo, evid in PONTOS_FORTES:
        linhas.append([Paragraph(f"<b>{titulo}</b>", E["celula"]),
                       Paragraph(evid, E["celula"])])
    t = Table(linhas, colWidths=[5.3 * cm, 11.2 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#059669")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, TRACO),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0FDF4")]),
    ]))
    S.append(t)

    S.append(Spacer(1, 0.6 * cm))
    S.append(Paragraph("Pontos fracos — os riscos centrais", E["h1"]))
    for titulo, texto in PONTOS_FRACOS:
        S.append(Paragraph(titulo, E["h2"]))
        S.append(Paragraph(texto, E["p"]))

    # ── achados detalhados ──────────────────────────────────────────────
    S.append(Paragraph("Achados detalhados", E["h1"]))
    for cat, nome in CATEGORIAS.items():
        do_cat = [a for a in ACHADOS if a["categoria"] == cat]
        S.append(Paragraph(f"{cat} — {nome}", E["h2"]))
        if not do_cat:
            S.append(Paragraph(
                "<i>Nenhum achado nesta categoria.</i> Ver a linha correspondente "
                "nos pontos fortes.", E["p"]))
            continue
        for a in do_cat:
            partes = [
                Table([[chip(a["severidade"]),
                        Paragraph(f"<b>#{a['id']} — {a['titulo']}</b>", E["celula"])]],
                      colWidths=[2.3 * cm, 14.2 * cm],
                      style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                        ("LEFTPADDING", (0, 0), (0, 0), 0),
                                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4)])),
                Paragraph(f"<font face=\"Courier\" size=\"8\">{a['arquivo']}</font>", E["pequeno"]),
                bloco_codigo(a["codigo"]),
                Paragraph("POR QUE É EXPLORÁVEL", E["rotulo"]),
                Paragraph(a["porque"], E["pequeno"]),
                Paragraph("IMPACTO", E["rotulo"]),
                Paragraph(a["impacto"], E["pequeno"]),
                Paragraph("CONDIÇÃO DE EXPLORABILIDADE", E["rotulo"]),
                Paragraph(a["condicao"], E["pequeno"]),
                Paragraph("CORREÇÃO", E["rotulo"]),
                Paragraph(a["correcao"], E["pequeno"]),
                Spacer(1, 0.45 * cm),
            ]
            S.append(KeepTogether(partes[:4]))
            S.extend(partes[4:])

    # ── tabela-resumo ───────────────────────────────────────────────────
    S.append(Paragraph("Tabela de achados", E["h1"]))
    linhas = [[Paragraph("<b>Sev.</b>", E["celula"]),
               Paragraph("<b>Cat.</b>", E["celula"]),
               Paragraph("<b>Arquivo:linha</b>", E["celula"]),
               Paragraph("<b>Descrição</b>", E["celula"])]]
    for a in ACHADOS:
        linhas.append([
            chip(a["severidade"]),
            Paragraph(a["categoria"], E["celula"]),
            Paragraph(f"<font face=\"Courier\" size=\"7\">{a['arquivo']}</font>", E["celula"]),
            Paragraph(a["titulo"], E["celula"]),
        ])
    t = Table(linhas, colWidths=[2.4 * cm, 1.1 * cm, 6.2 * cm, 6.8 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TINTA),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, TRACO),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
    ]))
    S.append(t)

    S.append(Spacer(1, 0.7 * cm))
    S.append(Paragraph("Recomendações priorizadas", E["h1"]))
    linhas = [[Paragraph("<b>#</b>", E["celula"]),
               Paragraph("<b>Ação</b>", E["celula"]),
               Paragraph("<b>Por quê</b>", E["celula"])]]
    for pri, sev, acao, porque in RECOMENDACOES:
        linhas.append([
            Paragraph(f"<b><font color=\"{CORES[sev]}\">{pri}</font></b>", E["celula"]),
            Paragraph(f"<b>{acao}</b>", E["celula"]),
            Paragraph(porque, E["celula"]),
        ])
    t = Table(linhas, colWidths=[1.1 * cm, 6.0 * cm, 9.4 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TINTA),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, TRACO),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
    ]))
    S.append(t)

    S.append(PageBreak())

    # ── issues para o GitHub ────────────────────────────────────────────
    S.append(Paragraph("Issues para o GitHub", E["h1"]))
    S.append(Paragraph(
        "Uma issue por achado, em Markdown, pronta para copiar e colar. Os blocos são "
        "delimitados para que a cópia não arraste texto do relatório junto.", E["p"]))

    for a in ACHADOS:
        md = montar_issue(a)
        # Marcador, bloco e fechamento viajam juntos: um "--- ISSUE 4 ---"
        # sozinho no pe da pagina, com o conteudo na seguinte, quebra
        # justamente o que o delimitador existe para garantir — que dá para
        # selecionar do inicio ao fim sem arrastar texto do relatorio.
        S.append(KeepTogether([
            Spacer(1, 0.25 * cm),
            Paragraph(
                f"<font face=\"Courier\" size=\"7.5\" color=\"#6B7280\">--- ISSUE {a['id']} ---</font>",
                E["pequeno"]),
            bloco_issue(md),
            Paragraph(
                f"<font face=\"Courier\" size=\"7.5\" color=\"#6B7280\">--- FIM ISSUE {a['id']} ---</font>",
                E["pequeno"]),
            Spacer(1, 0.35 * cm),
        ]))

    return S, [rosca, barras]


def limpar(txt):
    """Tira a marcação do ReportLab, que não faz sentido dentro do Markdown."""
    import re
    txt = re.sub(r'<font face="Courier">(.*?)</font>', r'`\1`', txt, flags=re.S)
    txt = re.sub(r"<br\s*/?>", "\n", txt)
    txt = txt.replace("<b>", "**").replace("</b>", "**")
    txt = txt.replace("<i>", "_").replace("</i>", "_")
    txt = re.sub(r"<[^>]+>", "", txt)
    txt = txt.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    return re.sub(r"\n{3,}", "\n\n", txt).strip()


def montar_issue(a):
    sev = ROTULO_SEVERIDADE[a["severidade"]].lower()
    aceite = "\n".join(f"- [ ] {limpar(c)}" for c in a["aceite"])
    return f"""## [Segurança] {a['titulo']}

**Labels:** `security`, `severidade:{sev}`, `{a['categoria'].lower()}`

### Problema
{limpar(a['porque'])}

### Evidência
`{a['arquivo']}`

```sql
{a['codigo']}
```

### Impacto
{limpar(a['impacto'])}

### Condição de explorabilidade
{limpar(a['condicao'])}

### Sugestão de correção
{limpar(a['correcao'])}

### Critérios de aceite
{aceite}
"""


def bloco_issue(md):
    seguro = (md.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\n", "<br/>").replace(" ", "&nbsp;"))
    t = Table([[Paragraph(seguro, E["issue"])]], colWidths=[16.5 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
        ("BOX", (0, 0), (-1, -1), 0.6, TRACO),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def main():
    doc = BaseDocTemplate(
        SAIDA, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title=TITULO, author="Auditoria automatizada", subject="Segurança")
    quadro = Frame(doc.leftMargin, doc.bottomMargin,
                   doc.width, doc.height, id="corpo")
    doc.addPageTemplates([PageTemplate(id="padrao", frames=[quadro], onPage=moldura)])

    conteudo, temporarios = montar()
    doc.build(conteudo)

    for f in temporarios:
        try:
            os.remove(f)
        except OSError:
            pass

    # Também deixa as issues em Markdown solto, que é como se cola de verdade.
    caminho_md = os.path.join(AQUI, "issues-github.md")
    with open(caminho_md, "w", encoding="utf-8") as fh:
        fh.write(f"# Issues de segurança — {PROJETO}\n\n_{DATA}_\n\n")
        for a in ACHADOS:
            fh.write(f"--- ISSUE {a['id']} ---\n\n{montar_issue(a)}\n"
                     f"--- FIM ISSUE {a['id']} ---\n\n")

    print(f"PDF:  {SAIDA}")
    print(f"MD:   {caminho_md}")


if __name__ == "__main__":
    main()
