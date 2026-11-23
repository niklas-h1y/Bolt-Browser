package com.bolt.browser;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends Activity {
    private static final int BG = Color.rgb(17,18,16);
    private static final int PANEL = Color.rgb(25,27,24);
    private static final int PANEL2 = Color.rgb(34,37,32);
    private static final int TEXT = Color.rgb(242,244,237);
    private static final int MUTED = Color.rgb(146,152,140);
    private static final int ACCENT = Color.rgb(184,243,107);
    private static final String HOME = "file:///android_asset/index.html";

    private LinearLayout root, tabsBar;
    private FrameLayout webHost;
    private EditText address;
    private TextView status, tabCount;
    private boolean javascriptEnabled = true;
    private final ArrayList<Tab> tabs = new ArrayList<>();
    private int active = -1;

    private static class Tab {
        WebView web;
        String title = "New tab";
        String url = HOME;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        buildChrome();
        javascriptEnabled = getPreferences(MODE_PRIVATE).getBoolean("javascript", true);
        addTab(HOME);
    }

    private int dp(float value) { return (int)(value * getResources().getDisplayMetrics().density + 0.5f); }

    private TextView label(String text, int size, int color) {
        TextView v = new TextView(this);
        v.setText(text); v.setTextSize(size); v.setTextColor(color);
        v.setGravity(Gravity.CENTER); v.setPadding(dp(8), dp(6), dp(8), dp(6));
        return v;
    }

    private Button button(String text, boolean primary) {
        Button b = new Button(this);
        b.setText(text); b.setTextSize(13); b.setAllCaps(false);
        b.setTextColor(primary ? Color.rgb(23,32,13) : MUTED);
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(primary ? ACCENT : PANEL2));
        b.setMinWidth(dp(38)); b.setMinimumWidth(dp(38));
        b.setPadding(dp(5), 0, dp(5), 0);
        return b;
    }

    private void buildChrome() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        setContentView(root);

        // Chrome-style top toolbar: the address bar is the first browser control
        // directly below Android's status bar, always visible while browsing.
        LinearLayout addressRow = new LinearLayout(this);
        addressRow.setGravity(Gravity.CENTER_VERTICAL);
        addressRow.setPadding(dp(8), dp(6), dp(8), dp(6));
        addressRow.setBackgroundColor(BG);

        TextView siteIcon = label("◈", 17, ACCENT);
        addressRow.addView(siteIcon, new LinearLayout.LayoutParams(dp(30), dp(44)));

        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextSize(14);
        address.setTextColor(TEXT);
        address.setHintTextColor(MUTED);
        address.setHint("Search or enter address");
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setPadding(dp(12), 0, dp(8), 0);
        address.setSelectAllOnFocus(true);
        GradientDrawable addressBg = new GradientDrawable();
        addressBg.setColor(PANEL2);
        addressBg.setCornerRadius(dp(22));
        addressBg.setStroke(dp(1), Color.rgb(55,60,51));
        address.setBackground(addressBg);
        addressRow.addView(address, new LinearLayout.LayoutParams(0, dp(44), 1));

        Button tabSwitcher = button(String.valueOf(Math.max(1, tabs.size())), false);
        tabSwitcher.setTextSize(12);
        tabSwitcher.setOnClickListener(v -> showTabPicker());
        LinearLayout.LayoutParams tabLp = new LinearLayout.LayoutParams(dp(42), dp(42));
        tabLp.leftMargin = dp(5);
        addressRow.addView(tabSwitcher, tabLp);

        Button topMenu = button("⋮", false);
        topMenu.setTextSize(20);
        topMenu.setOnClickListener(v -> showMenu(topMenu));
        addressRow.addView(topMenu, new LinearLayout.LayoutParams(dp(40), dp(42)));

        address.setOnEditorActionListener((v, action, event) -> {
            if(action==EditorInfo.IME_ACTION_GO || (event!=null && event.getKeyCode()==KeyEvent.KEYCODE_ENTER)) {
                navigateFromAddress(); return true;
            }
            return false;
        });
        root.addView(addressRow, new LinearLayout.LayoutParams(-1, dp(56)));

        HorizontalScrollView tabScroll = new HorizontalScrollView(this);
        tabScroll.setHorizontalScrollBarEnabled(false);
        tabsBar = new LinearLayout(this);
        tabsBar.setOrientation(LinearLayout.HORIZONTAL);
        tabsBar.setPadding(dp(8), 0, dp(8), dp(4));
        tabScroll.addView(tabsBar);
        root.addView(tabScroll, new LinearLayout.LayoutParams(-1, dp(40)));

        webHost = new FrameLayout(this);
        root.addView(webHost, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout bottom = new LinearLayout(this);
        bottom.setGravity(Gravity.CENTER_VERTICAL);
        bottom.setPadding(dp(6), dp(4), dp(6), dp(4));
        bottom.setBackgroundColor(PANEL);

        Button back = button("‹", false);
        back.setTextSize(23);
        back.setOnClickListener(v -> { if(current()!=null && current().web.canGoBack()) current().web.goBack(); });
        Button forward = button("›", false);
        forward.setTextSize(23);
        forward.setOnClickListener(v -> { if(current()!=null && current().web.canGoForward()) current().web.goForward(); });
        Button home = button("⌂", false);
        home.setTextSize(20);
        home.setOnClickListener(v -> load(HOME));
        Button reload = button("↻", false);
        reload.setTextSize(20);
        reload.setOnClickListener(v -> { if(current()!=null) current().web.reload(); });
        Button bookmark = button("☆", false);
        bookmark.setTextSize(19);
        bookmark.setOnClickListener(v -> saveBookmark());

        bottom.addView(back, new LinearLayout.LayoutParams(0, dp(44), 1));
        bottom.addView(forward, new LinearLayout.LayoutParams(0, dp(44), 1));
        bottom.addView(home, new LinearLayout.LayoutParams(0, dp(44), 1));
        bottom.addView(reload, new LinearLayout.LayoutParams(0, dp(44), 1));
        bottom.addView(bookmark, new LinearLayout.LayoutParams(0, dp(44), 1));
        root.addView(bottom, new LinearLayout.LayoutParams(-1, dp(52)));

        status = label("Ready · Bolt Browser", 10, MUTED);
        status.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
        status.setPadding(dp(12), 0, dp(12), 0);
        status.setBackgroundColor(PANEL);
        root.addView(status, new LinearLayout.LayoutParams(-1, dp(20)));
    }

    private void showTabPicker() {
        if (tabs.isEmpty()) return;
        String[] names = new String[tabs.size() + 1];
        for (int i = 0; i < tabs.size(); i++) names[i] = (i == active ? "✓ " : "") + shortTitle(tabs.get(i).title);
        names[tabs.size()] = "+ New tab";
        new AlertDialog.Builder(this).setTitle("Tabs")
            .setItems(names, (dialog, which) -> {
                if (which == tabs.size()) addTab(HOME);
                else selectTab(which);
            }).show();
    }

    private Tab current() { return active >= 0 && active < tabs.size() ? tabs.get(active) : null; }

    private void addTab(String url) {
        Tab tab = new Tab();
        WebView web = new WebView(this); tab.web = web;
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(javascriptEnabled); settings.setDomStorageEnabled(true);
        settings.setSupportZoom(true); settings.setBuiltInZoomControls(true); settings.setDisplayZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true); settings.setSupportMultipleWindows(true);
        settings.setLoadWithOverviewMode(true); settings.setUseWideViewPort(true);
        web.setBackgroundColor(BG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme()==null ? "" : uri.getScheme();
                if (scheme.equals("http") || scheme.equals("https") || scheme.equals("file") || scheme.equals("about")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch(Exception ignored) {}
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                tab.url=url; if(current()==tab) { address.setText(url.equals(HOME)?"":url); status.setText("Loading…"); }
            }
            @Override public void onPageFinished(WebView view, String url) {
                tab.url=url; recordHistory(url); String title=view.getTitle(); if(title!=null && !title.trim().isEmpty()) tab.title=title;
                if(current()==tab) { address.setText(url.equals(HOME)?"":url); status.setText(tab.title); }
                refreshTabs();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onReceivedTitle(WebView view, String title) {
                if(title!=null && !title.trim().isEmpty()) tab.title=title;
                refreshTabs();
            }
            @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                addTab("about:blank");
                WebView.WebViewTransport transport=(WebView.WebViewTransport)resultMsg.obj;
                transport.setWebView(current().web);
                resultMsg.sendToTarget();
                return true;
            }
        });
        web.setDownloadListener((downloadUrl, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                DownloadManager.Request request=new DownloadManager.Request(Uri.parse(downloadUrl));
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, android.webkit.URLUtil.guessFileName(downloadUrl,contentDisposition,mimeType));
                ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(this,"Download started",Toast.LENGTH_SHORT).show();
            } catch(Exception ex) { Toast.makeText(this,"Could not start download",Toast.LENGTH_LONG).show(); }
        });
        tabs.add(tab); active=tabs.size()-1;
        webHost.addView(web, new FrameLayout.LayoutParams(-1,-1));
        web.loadUrl(url);
        selectTab(active);
    }

    private void selectTab(int index) {
        if(index<0 || index>=tabs.size()) return;
        active=index;
        for(int i=0;i<tabs.size();i++) tabs.get(i).web.setVisibility(i==active?View.VISIBLE:View.GONE);
        Tab tab=current();
        address.setText(tab.url.equals(HOME) || tab.url.equals("about:blank") ? "" : tab.url);
        status.setText(tab.title);
        refreshTabs();
    }

    private void refreshTabs() {
        if(tabsBar==null) return;
        tabsBar.removeAllViews();
        for(int i=0;i<tabs.size();i++) {
            final int index=i;
            Button t=button((i==active?"● ":"")+shortTitle(tabs.get(i).title),i==active);
            t.setTextSize(11); t.setMaxWidth(dp(170));
            t.setOnClickListener(v -> selectTab(index));
            tabsBar.addView(t, new LinearLayout.LayoutParams(-2,dp(32)));
        }
        Button plus=button("+",false); plus.setOnClickListener(v -> addTab(HOME));
        tabsBar.addView(plus);
    }

    private String shortTitle(String title) { return title.length()>18 ? title.substring(0,16)+"…" : title; }

    private void load(String url) {
        if(current()==null) { addTab(url); return; }
        current().web.loadUrl(url);
    }

    private void navigateFromAddress() {
        String value=address.getText().toString().trim();
        if(value.isEmpty()) return;
        String url=value;
        if(!url.matches("(?i)^(https?://|file:|about:).*")) {
            if(url.matches("(?i)^([a-z0-9-]+\\.)+[a-z]{2,}(:[0-9]+)?(/.*)?$") || url.startsWith("localhost")) url="https://"+url;
            else {
                try { url="https://www.google.com/search?q="+URLEncoder.encode(url,"UTF-8"); }
                catch(Exception ignored) {}
            }
        }
        load(url);
        ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(),0);
        address.clearFocus();
    }

    private void saveBookmark() {
        Tab tab=current(); if(tab==null || tab.url.equals(HOME)) { Toast.makeText(this,"Open a website first",Toast.LENGTH_SHORT).show(); return; }
        Set<String> saved=new HashSet<>(getPreferences(MODE_PRIVATE).getStringSet("bookmarks",new HashSet<>()));
        saved.add(tab.url);
        getPreferences(MODE_PRIVATE).edit().putStringSet("bookmarks",saved).apply();
        Toast.makeText(this,"Bookmark saved",Toast.LENGTH_SHORT).show();
    }

    private void showMenu(View anchor) {
        PopupMenu menu=new PopupMenu(this,anchor);
        menu.getMenu().add("New tab").setOnMenuItemClickListener(item->{addTab(HOME);return true;});
        menu.getMenu().add("Bookmarks").setOnMenuItemClickListener(item->{showSaved("bookmarks");return true;});
        menu.getMenu().add("History").setOnMenuItemClickListener(item->{showSaved("history");return true;});
        menu.getMenu().add("Downloads").setOnMenuItemClickListener(item->{openDownloads();return true;});
        menu.getMenu().add("Extensions").setOnMenuItemClickListener(item->{showExtensionsInfo();return true;});
        menu.getMenu().add("Settings").setOnMenuItemClickListener(item->{showSettings();return true;});
        menu.getMenu().add("Close current tab").setOnMenuItemClickListener(item->{closeCurrentTab();return true;});
        menu.getMenu().add("About Bolt").setOnMenuItemClickListener(item->{new AlertDialog.Builder(this).setTitle("Bolt Browser").setMessage("Android edition · Chromium-based Android System WebView").setPositiveButton("OK",null).show();return true;});
        menu.show();
    }

    private void openDownloads() {
        try { startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)); }
        catch(Exception ex) { Toast.makeText(this,"Open the Downloads app to view saved files",Toast.LENGTH_LONG).show(); }
    }

    private void showExtensionsInfo() {
        new AlertDialog.Builder(this).setTitle("Bolt extensions")
            .setMessage("Android WebView does not include the Chrome extension runtime. The /extensions folder in the Bolt GitHub project contains Manifest V3 extensions for the desktop Electron build. Android extension support needs a separate compatible runtime; desktop extensions cannot simply be copied into WebView.")
            .setPositiveButton("OK",null).show();
    }

    private void showSettings() {
        String[] options = {"Enable JavaScript", "Clear browsing history", "Clear website data"};
        boolean[] checked = {javascriptEnabled, false, false};
        new AlertDialog.Builder(this).setTitle("Settings")
            .setMultiChoiceItems(options, checked, (dialog, which, isChecked) -> {
                if (which == 0) {
                    javascriptEnabled = isChecked;
                    for (Tab tab : tabs) tab.web.getSettings().setJavaScriptEnabled(javascriptEnabled);
                    getPreferences(MODE_PRIVATE).edit().putBoolean("javascript", javascriptEnabled).apply();
                }
            })
            .setNeutralButton("Clear history", (dialog, which) -> getPreferences(MODE_PRIVATE).edit().remove("history").apply())
            .setPositiveButton("Done",null).show();
    }

    private void showSaved(String key) {
        Set<String> values=getPreferences(MODE_PRIVATE).getStringSet(key,new HashSet<>());
        ArrayList<String> list=new ArrayList<>(values); Collections.reverse(list);
        if(list.isEmpty()) { Toast.makeText(this,key.equals("history")?"No history yet":"No bookmarks yet",Toast.LENGTH_SHORT).show(); return; }
        new AlertDialog.Builder(this).setTitle(key.equals("history")?"History":"Bookmarks").setItems(list.toArray(new String[0]),(d,which)->load(list.get(which))).setNegativeButton("Close",null).show();
    }

    private void recordHistory(String url) {
        if(url==null || !url.startsWith("http")) return;
        Set<String> values=new HashSet<>(getPreferences(MODE_PRIVATE).getStringSet("history",new HashSet<>()));
        values.add(url);
        getPreferences(MODE_PRIVATE).edit().putStringSet("history",values).apply();
    }

    private void closeCurrentTab() {
        if(tabs.size()<=1) { load(HOME); return; }
        Tab removed=tabs.remove(active); webHost.removeView(removed.web); removed.web.stopLoading(); removed.web.destroy();
        active=Math.max(0,active-1); selectTab(active);
    }

    @Override public void onBackPressed() {
        Tab tab=current();
        if(tab!=null && tab.web.canGoBack()) tab.web.goBack();
        else if(tabs.size()>1) closeCurrentTab();
        else load(HOME);
    }

    @Override protected void onDestroy() {
        for(Tab tab:tabs) { tab.web.stopLoading(); tab.web.destroy(); }
        tabs.clear(); super.onDestroy();
    }
}
